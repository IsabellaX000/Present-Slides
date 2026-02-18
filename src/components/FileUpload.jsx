import { useRef } from 'react'
import './FileUpload.css'

function FileUpload({ onFileUpload }) {
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/pdf') {
      onFileUpload(file)
    } else {
      alert('Please upload a PDF file')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      onFileUpload(file)
    } else {
      alert('Please upload a PDF file')
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  return (
    <div
      className="file-upload-container"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="file-upload-box">
        <div className="upload-icon">📄</div>
        <h1>Present Slides</h1>
        <p>Upload a PDF to get AI-powered explanations for each page</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          className="upload-button"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose PDF File
        </button>
        <p className="upload-hint">or drag and drop your PDF here</p>
      </div>
    </div>
  )
}

export default FileUpload
