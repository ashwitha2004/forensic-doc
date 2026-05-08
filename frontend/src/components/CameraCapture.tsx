import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { X, Camera, AlertCircle, Loader2, RotateCw, Smartphone } from 'lucide-react';

// Type definitions for production-ready TypeScript
interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

interface CameraState {
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  capturedImage: string | null;
  hasPermission: boolean;
  isMobile: boolean;
  facingMode: 'user' | 'environment';
  availableCameras: MediaDeviceInfo[];
}

interface CameraError extends Error {
  name: string;
}

// Custom hook for camera management
const useCamera = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef<boolean>(true);
  const [state, setState] = useState<CameraState>({
    isLoading: false,
    isStreaming: false,
    error: null,
    capturedImage: null,
    hasPermission: false,
    isMobile: false,
    facingMode: 'user',
    availableCameras: []
  });

  // Detect mobile device
  useEffect(() => {
    const userAgent = navigator.userAgent || '';
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    if (mountedRef.current) {
      setState(prev => ({ ...prev, isMobile: isMobileDevice }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[CAMERA] Cleaning up camera resources');
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        console.log('[CAMERA] Stopping track:', track.label);
        track.stop();
      });
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (mountedRef.current) {
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: null
      }));
    }
  }, [videoRef]);

  // Initialize camera
  const initialize = useCallback(async (facingMode: 'user' | 'environment' = 'user') => {
    console.log('[CAMERA] Initializing camera with facing mode:', facingMode);
    console.log('[CAMERA] Video ref current:', videoRef.current);
    
    if (!videoRef.current) {
      console.error('[CAMERA] Video element not found during initialization');
      const error = new Error('Video element not found. Please refresh and try again.') as CameraError;
      error.name = 'VideoElementNotFound';
      throw error;
    }

    console.log('[CAMERA] Video element found, proceeding with initialization');
    if (mountedRef.current) {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
    }

    try {
      // Check for camera support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('[CAMERA] Camera not supported in this browser');
        throw new Error('Camera not supported in this browser') as CameraError;
      }

      console.log('[CAMERA] Camera API supported, checking available devices');

      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      console.log('[CAMERA] Available cameras:', videoDevices.map(d => d.label));
      console.log('[CAMERA] Number of cameras found:', videoDevices.length);

      if (videoDevices.length === 0) {
        throw new Error('No camera found. Please connect a camera and try again.') as CameraError;
      }

      // Determine camera constraints
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: { ideal: facingMode }
        },
        audio: false
      };

      console.log('[CAMERA] Requesting camera with constraints:', constraints);

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      console.log('[CAMERA] Camera access granted, stream tracks:', stream.getTracks().length);

      // Attach stream to video element
      const video = videoRef.current;
      video.srcObject = stream;
      
      // Set video properties for reliable autoplay
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;

      console.log('[CAMERA] Stream attached to video element, waiting for metadata');

      // Wait for video to be ready with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error('[CAMERA] Video loading timeout');
          reject(new Error('Video loading timeout'));
        }, 10000);

        const handleLoadedMetadata = () => {
          clearTimeout(timeout);
          console.log('[CAMERA] Video metadata loaded successfully:', {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
            currentTime: video.currentTime
          });
          resolve();
        };

        const handleError = (event: Event) => {
          clearTimeout(timeout);
          console.error('[CAMERA] Video error event:', event);
          reject(new Error('Video loading error'));
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
        video.addEventListener('error', handleError, { once: true });
      });

      // Start playing video
      try {
        console.log('[CAMERA] Attempting to play video');
        await video.play();
        console.log('[CAMERA] Video started playing successfully');
      } catch (playError) {
        console.error('[CAMERA] Video play error:', playError);
        throw new Error('Failed to start video playback');
      }

      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          isStreaming: true,
          hasPermission: true,
          error: null,
          availableCameras: videoDevices,
          facingMode
        }));
      }

      console.log('[CAMERA] Camera initialized successfully');

    } catch (error) {
      console.error('[CAMERA] Camera initialization failed:', error);
      
      let errorMessage = 'Failed to access camera';
      
      if (error instanceof Error) {
        console.log('[CAMERA] Error type:', error.name, error.message);
        if (error.name === 'NotAllowedError' || error.message.includes('denied')) {
          errorMessage = 'Camera access denied. Please allow camera access and try again.';
        } else if (error.name === 'NotFoundError' || error.message.includes('not found')) {
          errorMessage = 'No camera found. Please connect a camera and try again.';
        } else if (error.name === 'NotReadableError' || error.message.includes('in use')) {
          errorMessage = 'Camera is already in use by another application.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Camera loading timeout. Please try again.';
        } else if (error.name === 'VideoElementNotFound') {
          errorMessage = error.message;
        } else {
          errorMessage = error.message;
        }
      }

      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
          hasPermission: false,
          isStreaming: false
        }));
      }

      throw error;
    }
  }, [videoRef]);

  // Switch camera
  const switchCamera = useCallback(async () => {
    if (!state.isStreaming || state.availableCameras.length <= 1) {
      return;
    }

    console.log('[CAMERA] Switching camera');
    const newFacingMode = state.facingMode === 'user' ? 'environment' : 'user';
    
    cleanup();
    
    // Add small delay to ensure cleanup completes
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await initialize(newFacingMode);
  }, [state.isStreaming, state.availableCameras.length, state.facingMode, cleanup, initialize]);

  // Capture image
  const capture = useCallback((canvasRef: React.RefObject<HTMLCanvasElement>) => {
    return new Promise<string>((resolve, reject) => {
      console.log('[CAMERA] Capturing image');
      
      if (!videoRef.current || !canvasRef.current || !state.isStreaming) {
        reject(new Error('Cannot capture: camera not ready'));
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Cannot get canvas context'));
        return;
      }

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob with high quality
      canvas.toBlob((blob) => {
        if (blob) {
          console.log('[CAMERA] Image captured, blob size:', blob.size);
          
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result) {
              const imageData = reader.result as string;
              if (mountedRef.current) {
                setState(prev => ({ ...prev, capturedImage: imageData }));
              }
              resolve(imageData);
            } else {
              reject(new Error('Failed to read captured image'));
            }
          };
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      }, 'image/jpeg', 0.95);
    });
  }, [videoRef, state.isStreaming, mountedRef]);

  // Retake photo
  const retake = useCallback(() => {
    console.log('[CAMERA] Retaking photo');
    if (mountedRef.current) {
      setState(prev => ({ ...prev, capturedImage: null }));
    }
  }, [mountedRef]);

  return {
    state,
    initialize,
    cleanup,
    switchCamera,
    capture,
    retake
  };
};

// Main CameraCapture Component
export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const camera = useCamera(videoRef);

  // Handle mobile file input
  const handleMobileCapture = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('[CAMERA] Mobile file selected:', file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          onCapture(e.target.result as string);
          onClose();
        }
      };
      reader.readAsDataURL(file);
    }
  }, [onCapture, onClose]);

  // Accept captured photo
  const acceptPhoto = useCallback(() => {
    if (camera.state.capturedImage) {
      console.log('[CAMERA] Accepting captured photo');
      onCapture(camera.state.capturedImage);
      camera.cleanup();
      onClose();
    }
  }, [camera.state.capturedImage, onCapture, camera.cleanup, onClose]);

  // Initialize camera on mount (desktop only) - with proper timing
  useLayoutEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    const initTimer = requestAnimationFrame(() => {
      if (!camera.state.isMobile && videoRef.current) {
        console.log('[CAMERA] Starting camera initialization after mount');
        camera.initialize();
      }
    });

    return () => {
      cancelAnimationFrame(initTimer);
      camera.cleanup();
    };
  }, [camera.state.isMobile, camera.initialize, camera.cleanup]);

  // Handle capture button click
  const handleCapture = useCallback(async () => {
    try {
      await camera.capture(canvasRef);
      console.log('[CAMERA] Capture successful');
    } catch (error) {
      console.error('[CAMERA] Capture failed:', error);
      // Error will be handled by the UI state
    }
  }, [camera.capture, canvasRef]);

  // Render mobile fallback
  if (camera.state.isMobile) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleMobileCapture}
        />
        
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Capture Photo</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="text-center py-8">
              <Smartphone className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                Opening your device camera...
              </p>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Render desktop camera interface
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Capture Photo</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Video element ALWAYS exists - no conditional rendering */}
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto"
          />
          
          {/* Loading overlay */}
          {camera.state.isLoading && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-white">Initializing camera...</p>
                <p className="text-sm text-gray-300 mt-2">Please allow camera access when prompted</p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {camera.state.error && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-red-400 text-center mb-4">{camera.state.error}</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => camera.initialize()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <RotateCw className="w-4 h-4" />
                    Retry
                  </button>
                  <button
                    onClick={onClose}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Camera switch button */}
          {camera.state.isStreaming && camera.state.availableCameras.length > 1 && (
            <button
              onClick={camera.switchCamera}
              className="absolute top-4 right-4 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full p-2 transition-all"
              title="Switch camera"
            >
              <RotateCw className="w-5 h-5 text-gray-700" />
            </button>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {/* Capture controls - shown when streaming and no captured image */}
        {camera.state.isStreaming && !camera.state.capturedImage && (
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCapture}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Camera className="w-5 h-5" />
              Capture
            </button>
            
            <button
              onClick={onClose}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" />
              Cancel
            </button>
          </div>
        )}

        {/* Captured Image Preview */}
        {camera.state.capturedImage && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <img
                src={camera.state.capturedImage}
                alt="Captured"
                className="w-full h-auto"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={camera.retake}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <RotateCw className="w-5 h-5" />
                Retake
              </button>
              
              <button
                onClick={acceptPhoto}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Accept
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!camera.state.isLoading && !camera.state.error && !camera.state.capturedImage && (
          <div className="mt-4 text-sm text-gray-500">
            <p>• Position yourself in good lighting</p>
            <p>• Ensure camera permission is granted</p>
            <p>• Click Capture to take a photo</p>
            {camera.state.availableCameras.length > 1 && (
              <p>• Use the camera switch button to change cameras</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraCapture;
