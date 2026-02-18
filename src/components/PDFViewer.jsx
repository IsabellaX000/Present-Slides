import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './PDFViewer.css'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

function PDFViewer({ file, currentPage, onPageChange, onTotalPagesChange }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const pdfRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!file) return

    let isCancelled = false

    const loadPDF = async () => {
      try {
        setLoading(true)
        setError(null)

        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

        if (isCancelled) return

        pdfRef.current = pdf
        onTotalPagesChange(pdf.numPages)
        await renderPage(pdf, currentPage)
      } catch (err) {
        if (!isCancelled) {
          setError(`Failed to load PDF: ${err.message}`)
          console.error(err)
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadPDF()

    return () => {
      isCancelled = true
    }
  }, [file])

  useEffect(() => {
    if (!file || !pdfRef.current) return

    const renderCurrentPage = async () => {
      try {
        await renderPage(pdfRef.current, currentPage)
      } catch (err) {
        setError(`Failed to render page: ${err.message}`)
        console.error(err)
      }
    }

    renderCurrentPage()
  }, [currentPage, file])

  const renderPage = async (pdf, pageNumber) => {
    try {
      const page = await pdf.getPage(pageNumber)
      const canvas = canvasRef.current
      if (!canvas) {
        // Wait a bit for canvas to be ready
        await new Promise(resolve => setTimeout(resolve, 100))
        return renderPage(pdf, pageNumber)
      }

      const context = canvas.getContext('2d')
      
      // Calculate scale to fit the container while maintaining aspect ratio
      const container = containerRef.current || canvas.parentElement
      if (!container) {
        await new Promise(resolve => setTimeout(resolve, 100))
        return renderPage(pdf, pageNumber)
      }

      const containerWidth = container.clientWidth || window.innerWidth * 0.6
      const containerHeight = container.clientHeight || window.innerHeight - 120
      const dpr = window.devicePixelRatio || 1

      const viewport = page.getViewport({ scale: 1.0 })
      const logicalScale = Math.min(
        (containerWidth / viewport.width) * 0.98,
        (containerHeight / viewport.height) * 0.98
      )
      const pixelScale = logicalScale * dpr
      const pixelViewport = page.getViewport({ scale: pixelScale })

      canvas.width = pixelViewport.width
      canvas.height = pixelViewport.height
      canvas.style.width = `${logicalScale * viewport.width}px`
      canvas.style.height = `${logicalScale * viewport.height}px`

      await page.render({
        canvasContext: context,
        viewport: pixelViewport
      }).promise
    } catch (err) {
      console.error('Error rendering page:', err)
      setError(`Failed to render page ${pageNumber}: ${err.message}`)
    }
  }

  if (error) {
    return (
      <div className="pdf-error">
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="pdf-viewer">
      {loading && (
        <div className="pdf-loading">
          <div className="spinner"></div>
          <p>Loading PDF...</p>
        </div>
      )}
      <div className="pdf-canvas-container" ref={containerRef}>
        <canvas ref={canvasRef} className="pdf-canvas" />
      </div>
    </div>
  )
}

export default PDFViewer
