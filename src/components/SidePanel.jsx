import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import './SidePanel.css'

function isQuotaError(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.toLowerCase()
  return t.includes('429') || t.includes('quota') || t.includes('rate limit') || t.includes('exceeded your current quota')
}

function SidePanel({ currentPage, explanation, isGenerating, generatingPage, generatingTotal, totalPages, error }) {
  const showQuotaMessage = error ? isQuotaError(error) : explanation ? isQuotaError(explanation) : false
  const total = generatingTotal || totalPages

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h2>Page {currentPage} Explanation</h2>
      </div>
      <div className="side-panel-content">
        {isGenerating ? (
          <div className="generating">
            <div className="spinner"></div>
            <p>
              Generating page <strong>{generatingPage}</strong> of <strong>{total || '…'}</strong>
            </p>
            {total > 0 && (
              <div className="progress-bar-wrap">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${(100 * generatingPage) / total}%` }}
                />
              </div>
            )}
            <p className="generating-hint">Each page may take 15–30 seconds. Please wait.</p>
          </div>
        ) : showQuotaMessage ? (
          <div className="error-message quota-message">
            <p><strong>Rate limit / quota exceeded</strong></p>
            <p>Wait a few minutes and try again, or use a smaller PDF. Free tier has limited requests per minute and per day.</p>
            <p><a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener noreferrer">Gemini API rate limits →</a></p>
          </div>
        ) : error ? (
          <div className="error-message">
            <p>⚠️ {error}</p>
          </div>
        ) : explanation && !isQuotaError(explanation) ? (
          <div className="explanation-content markdown-body">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {explanation}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="no-explanation">
            <p>No explanation available for this page.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default SidePanel
