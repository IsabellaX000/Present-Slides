import { useState, useRef } from 'react'
import PDFViewer from './components/PDFViewer'
import SidePanel from './components/SidePanel'
import FileUpload from './components/FileUpload'
import './App.css'

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [explanations, setExplanations] = useState({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(null)

  const [generatingPage, setGeneratingPage] = useState(0)
  const [generatingTotal, setGeneratingTotal] = useState(0)

  const handleFileUpload = async (file) => {
    setPdfFile(file)
    setCurrentPage(1)
    setError(null)
    setIsGenerating(true)
    setGeneratingPage(1)
    setGeneratingTotal(0)

    try {
      const explanationsData = await generateAllExplanations(file, (page, total) => {
        setGeneratingPage(page)
        setGeneratingTotal(total)
      })
      setExplanations(explanationsData)
    } catch (err) {
      setError(`Failed to generate explanations: ${err.message}`)
      console.error(err)
    } finally {
      setIsGenerating(false)
      setGeneratingPage(0)
      setGeneratingTotal(0)
    }
  }

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  return (
    <div className="app">
      {!pdfFile ? (
        <FileUpload onFileUpload={handleFileUpload} />
      ) : (
        <div className="app-container">
          <div className="pdf-container">
            <div className="top-bar">
              <button
                className="new-file-button"
                onClick={() => {
                  setPdfFile(null)
                  setCurrentPage(1)
                  setTotalPages(0)
                  setExplanations({})
                  setError(null)
                }}
              >
                📁 Upload New PDF
              </button>
            </div>
            <PDFViewer
              file={pdfFile}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onTotalPagesChange={setTotalPages}
            />
            <div className="navigation">
              <button
                className="nav-button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ← Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="nav-button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </div>
          </div>
          <SidePanel
            currentPage={currentPage}
            explanation={explanations[currentPage]}
            isGenerating={isGenerating}
            generatingPage={generatingPage}
            generatingTotal={generatingTotal}
            totalPages={totalPages}
            error={error}
          />
        </div>
      )}
    </div>
  )
}

const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'
const GROQ_MAX_BASE64_BYTES = 3 * 1024 * 1024 // ~3MB to stay under 4MB limit

async function groqGenerate(apiKey, prompt, imageDataUrl) {
  const url = 'https://api.groq.com/openai/v1/chat/completions'
  const imageUrl = imageDataUrl.startsWith('data:') ? imageDataUrl : `data:image/png;base64,${imageDataUrl}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.4
      }),
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Groq ${res.status}: ${errBody.slice(0, 200)}`)
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('Empty response from Groq')
    return text
  } catch (e) {
    clearTimeout(timeoutId)
    throw e
  }
}

async function generateAllExplanations(file, onProgress) {
  const groqKey = import.meta.env.VITE_GROQ_API_KEY
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!groqKey && !geminiKey) {
    throw new Error('Set VITE_GROQ_API_KEY or VITE_GEMINI_API_KEY in your .env file')
  }

  const useGroqFirst = !!groqKey
  let activeProvider = null // 'groq' | 'gemini'
  let activeModel = null
  let lastModelError = null

  let gemini = null
  if (geminiKey) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    gemini = new GoogleGenerativeAI(geminiKey)
  }
  const modelIdsToTry = ['gemini-2.0-flash', 'gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash']

  const MAX_RETRIES = 3
  const DEFAULT_RETRY_MS = 4000
  const REQUEST_TIMEOUT_MS = 90000
  const DELAY_BETWEEN_PAGES_MS = 3000

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const parseRetrySeconds = (err) => {
    const msg = err?.message || ''
    const match = msg.match(/retry in ([\d.]+)s/i)
    return match ? Math.ceil(parseFloat(match[1]) * 1000) : null
  }

  const tryGemini = async (model, prompt, base64Data) => {
    let lastErr
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out')), REQUEST_TIMEOUT_MS)
        )
        const result = await Promise.race([
          model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: base64Data } }
          ]),
          timeoutPromise
        ])
        return result.response.text()
      } catch (err) {
        lastErr = err
        const is429 = (err?.message || '').includes('429') || (err?.message || '').toLowerCase().includes('quota')
        if (is429 && attempt < MAX_RETRIES - 1) {
          const retryMs = Math.min(parseRetrySeconds(err) || DEFAULT_RETRY_MS, 5000)
          await sleep(retryMs)
          continue
        }
        throw err
      }
    }
    throw lastErr
  }

  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPages = pdf.numPages

  const explanations = {}

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) onProgress(pageNum, totalPages)
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2.0 })

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise

      let imageDataUrl = canvas.toDataURL('image/png')
      let base64Data = imageDataUrl.split(',')[1]

      // Groq 4MB base64 limit: use smaller image if needed
      if (useGroqFirst && base64Data.length * 0.75 > GROQ_MAX_BASE64_BYTES) {
        const small = document.createElement('canvas')
        const scale = Math.sqrt(GROQ_MAX_BASE64_BYTES / (base64Data.length * 0.75))
        small.width = Math.max(1, Math.floor(canvas.width * scale))
        small.height = Math.max(1, Math.floor(canvas.height * scale))
        small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height)
        imageDataUrl = small.toDataURL('image/jpeg', 0.85)
        base64Data = imageDataUrl.split(',')[1]
      }

      const prompt = `Analyze this PDF page (page ${pageNum} of ${totalPages}) and provide a comprehensive explanation. Include:

1. **Main Content**: A clear explanation of the primary content and topics covered on this page
2. **Elaboration**: Additional context, background information, and deeper insights
3. **Visual Analysis**: If there are graphs, charts, tables, or diagrams, provide a detailed written explanation/analysis of what they show, their significance, and key data points
4. **Key Takeaways**: Important points, conclusions, or insights from this page

Format your response clearly with sections. Be thorough but concise - provide enough information for someone to form a solid understanding of the content on this slide/page.`

      let text = null

      if (activeProvider === 'groq') {
        try {
          text = await groqGenerate(groqKey, prompt, imageDataUrl)
        } catch (err) {
          lastModelError = err
          activeProvider = null
        }
      } else if (activeProvider === 'gemini' && activeModel) {
        try {
          text = await tryGemini(activeModel, prompt, base64Data)
        } catch (err) {
          lastModelError = err
          activeProvider = null
          activeModel = null
        }
      }

      if (!activeProvider) {
        if (useGroqFirst && groqKey) {
          try {
            text = await groqGenerate(groqKey, prompt, imageDataUrl)
            activeProvider = 'groq'
          } catch (err) {
            lastModelError = err
          }
        }
        if (!text && gemini) {
          for (const modelId of modelIdsToTry) {
            try {
              const model = gemini.getGenerativeModel({ model: modelId })
              text = await tryGemini(model, prompt, base64Data)
              activeProvider = 'gemini'
              activeModel = model
              break
            } catch (err) {
              lastModelError = err
              if (err?.message?.includes('404') || err?.message?.includes('not found')) continue
              throw err
            }
          }
        }
      }

      if (text) {
        explanations[pageNum] = text
      } else {
        explanations[pageNum] = `Explanation unavailable for page ${pageNum}. ${lastModelError?.message || 'Add VITE_GROQ_API_KEY or VITE_GEMINI_API_KEY in .env'}`
      }

      if (pageNum < totalPages) await sleep(DELAY_BETWEEN_PAGES_MS)
    } catch (err) {
      console.error(`Error processing page ${pageNum}:`, err)
      explanations[pageNum] = `Error generating explanation for page ${pageNum}: ${err.message}`
    }
  }

  return explanations
}

export default App
