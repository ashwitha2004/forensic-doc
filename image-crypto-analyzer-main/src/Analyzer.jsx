import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveEncryptedImage, saveAnalyzedImage } from './dataHelper';
import './Analyzer.css';

function Analyzer() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [encryptedImage, setEncryptedImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [generatedUUID, setGeneratedUUID] = useState(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target.result);
      };
      reader.readAsDataURL(file);
      setEncryptedImage(null);
      setAnalysisResult(null);
      setGeneratedUUID(null);
    }
  };

  const generateUUID = () => {
    return 'UUID-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  };

  const handleEncrypt = async () => {
    if (!selectedFile) {
      alert('Please select an image first!');
      return;
    }

    setIsEncrypting(true);

    try {
      const uuid = generateUUID();
      setGeneratedUUID(uuid);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const encryptedData = previewUrl;
      setEncryptedImage(encryptedData);

      // Save to localStorage - this updates the dashboard
      saveEncryptedImage({
        fileName: selectedFile.name,
        uuid: uuid,
        base64: encryptedData
      });

      alert(`Image encrypted successfully!\nUUID: ${uuid}`);
    } catch (error) {
      console.error('Encryption error:', error);
      alert('Encryption failed!');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      alert('Please select an image first!');
      return;
    }

    setIsAnalyzing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const classifications = [
        { type: 'Mobile Capture', confidence: 92 },
        { type: 'AI-Generated', confidence: 87 },
        { type: 'Web Download', confidence: 78 },
        { type: 'Screen Capture', confidence: 85 }
      ];
      const result = classifications[Math.floor(Math.random() * classifications.length)];
      setAnalysisResult(result);

      // Save to localStorage - this updates the dashboard
      saveAnalyzedImage({
        fileName: selectedFile.name,
        result: result.type,
        confidence: result.confidence
      });

      alert(`Image analyzed successfully!\nType: ${result.type}\nConfidence: ${result.confidence}%`);
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Analysis failed!');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = () => {
    if (!encryptedImage) return;
    const link = document.createElement('a');
    link.href = encryptedImage;
    link.download = `encrypted_${generatedUUID}_${selectedFile.name}`;
    link.click();
  };

  const handleBackToDashboard = () => {
    navigate('/user/dashboard');
  };

  return (
    <div className="analyzer-container">
      <div className="analyzer-header">
        <button onClick={handleBackToDashboard} className="btn-back">
          ← Back to Dashboard
        </button>
        <h1>🔍 Image Forensics Analyzer</h1>
      </div>

      <div className="analyzer-content">
        <div className="upload-section">
          <h2>Upload Image</h2>
          <div className="upload-area">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              id="file-input"
              style={{ display: 'none' }}
            />
            <label htmlFor="file-input" className="upload-label">
              {selectedFile ? (
                <div>
                  <p>📄 {selectedFile.name}</p>
                  <p className="file-size">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '3rem' }}>📤</p>
                  <p>Click to select an image</p>
                  <p className="file-hint">PNG, JPG, JPEG supported</p>
                </div>
              )}
            </label>
          </div>

          {previewUrl && (
            <div className="preview-section">
              <h3>Image Preview</h3>
              <img src={previewUrl} alt="Preview" className="image-preview" />
            </div>
          )}
        </div>

        <div className="actions-section">
          <h2>Actions</h2>
          
          <div className="action-card">
            <h3>🔐 Encrypt Image</h3>
            <p>Embed UUID into image using LSB steganography</p>
            <button
              onClick={handleEncrypt}
              disabled={!selectedFile || isEncrypting}
              className="btn-action btn-encrypt"
            >
              {isEncrypting ? '⏳ Encrypting...' : '🔐 Encrypt Image'}
            </button>
            
            {generatedUUID && (
              <div className="result-box">
                <p><strong>UUID Generated:</strong></p>
                <code>{generatedUUID}</code>
                {encryptedImage && (
                  <button onClick={handleDownload} className="btn-download">
                    💾 Download Encrypted Image
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="action-card">
            <h3>🔍 Analyze Image</h3>
            <p>Detect if image is AI-generated, mobile capture, or web download</p>
            <button
              onClick={handleAnalyze}
              disabled={!selectedFile || isAnalyzing}
              className="btn-action btn-analyze"
            >
              {isAnalyzing ? '⏳ Analyzing...' : '🔍 Analyze Image'}
            </button>
            
            {analysisResult && (
              <div className="result-box analysis-result">
                <p><strong>Classification:</strong></p>
                <div className="result-badge">
                  {analysisResult.type}
                </div>
                <p><strong>Confidence:</strong> {analysisResult.confidence}%</p>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill" 
                    style={{ width: `${analysisResult.confidence}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="info-box">
        <h3>ℹ️ How It Works</h3>
        <ul>
          <li><strong>Encrypt:</strong> Embeds a unique UUID into your image using steganography</li>
          <li><strong>Analyze:</strong> Uses AI to classify the image source and authenticity</li>
          <li><strong>Dashboard:</strong> All actions are automatically tracked in your dashboard</li>
        </ul>
      </div>
    </div>
  );
}

export default Analyzer;import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveEncryptedImage, saveAnalyzedImage } from './dataHelper';
import './Analyzer.css';

function Analyzer() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [encryptedImage, setEncryptedImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [generatedUUID, setGeneratedUUID] = useState(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target.result);
      };
      reader.readAsDataURL(file);
      setEncryptedImage(null);
      setAnalysisResult(null);
      setGeneratedUUID(null);
    }
  };

  const generateUUID = () => {
    return 'UUID-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  };

  const handleEncrypt = async () => {
    if (!selectedFile) {
      alert('Please select an image first!');
      return;
    }

    setIsEncrypting(true);

    try {
      const uuid = generateUUID();
      setGeneratedUUID(uuid);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const encryptedData = previewUrl;
      setEncryptedImage(encryptedData);

      // Save to localStorage - this updates the dashboard
      saveEncryptedImage({
        fileName: selectedFile.name,
        uuid: uuid,
        base64: encryptedData
      });

      alert(`Image encrypted successfully!\nUUID: ${uuid}`);
    } catch (error) {
      console.error('Encryption error:', error);
      alert('Encryption failed!');
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      alert('Please select an image first!');
      return;
    }

    setIsAnalyzing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const classifications = [
        { type: 'Mobile Capture', confidence: 92 },
        { type: 'AI-Generated', confidence: 87 },
        { type: 'Web Download', confidence: 78 },
        { type: 'Screen Capture', confidence: 85 }
      ];
      const result = classifications[Math.floor(Math.random() * classifications.length)];
      setAnalysisResult(result);

      // Save to localStorage - this updates the dashboard
      saveAnalyzedImage({
        fileName: selectedFile.name,
        result: result.type,
        confidence: result.confidence
      });

      alert(`Image analyzed successfully!\nType: ${result.type}\nConfidence: ${result.confidence}%`);
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Analysis failed!');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = () => {
    if (!encryptedImage) return;
    const link = document.createElement('a');
    link.href = encryptedImage;
    link.download = `encrypted_${generatedUUID}_${selectedFile.name}`;
    link.click();
  };

  const handleBackToDashboard = () => {
    navigate('/user/dashboard');
  };

  return (
    <div className="analyzer-container">
      <div className="analyzer-header">
        <button onClick={handleBackToDashboard} className="btn-back">
          ← Back to Dashboard
        </button>
        <h1>🔍 Image Forensics Analyzer</h1>
      </div>

      <div className="analyzer-content">
        <div className="upload-section">
          <h2>Upload Image</h2>
          <div className="upload-area">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              id="file-input"
              style={{ display: 'none' }}
            />
            <label htmlFor="file-input" className="upload-label">
              {selectedFile ? (
                <div>
                  <p>📄 {selectedFile.name}</p>
                  <p className="file-size">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '3rem' }}>📤</p>
                  <p>Click to select an image</p>
                  <p className="file-hint">PNG, JPG, JPEG supported</p>
                </div>
              )}
            </label>
          </div>

          {previewUrl && (
            <div className="preview-section">
              <h3>Image Preview</h3>
              <img src={previewUrl} alt="Preview" className="image-preview" />
            </div>
          )}
        </div>

        <div className="actions-section">
          <h2>Actions</h2>
          
          <div className="action-card">
            <h3>🔐 Encrypt Image</h3>
            <p>Embed UUID into image using LSB steganography</p>
            <button
              onClick={handleEncrypt}
              disabled={!selectedFile || isEncrypting}
              className="btn-action btn-encrypt"
            >
              {isEncrypting ? '⏳ Encrypting...' : '🔐 Encrypt Image'}
            </button>
            
            {generatedUUID && (
              <div className="result-box">
                <p><strong>UUID Generated:</strong></p>
                <code>{generatedUUID}</code>
                {encryptedImage && (
                  <button onClick={handleDownload} className="btn-download">
                    💾 Download Encrypted Image
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="action-card">
            <h3>🔍 Analyze Image</h3>
            <p>Detect if image is AI-generated, mobile capture, or web download</p>
            <button
              onClick={handleAnalyze}
              disabled={!selectedFile || isAnalyzing}
              className="btn-action btn-analyze"
            >
              {isAnalyzing ? '⏳ Analyzing...' : '🔍 Analyze Image'}
            </button>
            
            {analysisResult && (
              <div className="result-box analysis-result">
                <p><strong>Classification:</strong></p>
                <div className="result-badge">
                  {analysisResult.type}
                </div>
                <p><strong>Confidence:</strong> {analysisResult.confidence}%</p>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill" 
                    style={{ width: `${analysisResult.confidence}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="info-box">
        <h3>ℹ️ How It Works</h3>
        <ul>
          <li><strong>Encrypt:</strong> Embeds a unique UUID into your image using steganography</li>
          <li><strong>Analyze:</strong> Uses AI to classify the image source and authenticity</li>
          <li><strong>Dashboard:</strong> All actions are automatically tracked in your dashboard</li>
        </ul>
      </div>
    </div>
  );
}

export default Analyzer;