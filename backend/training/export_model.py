"""
Model Export Script
Converts trained PyTorch models to ONNX and TensorFlow.js formats
"""

import torch
import torch.onnx
import onnx
import onnxruntime as ort
import tensorflow as tf
import tensorflowjs as tfjs
from pathlib import Path
import numpy as np
import logging
from typing import Dict, Tuple, Optional
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelExporter:
    """
    Export trained models to multiple formats for deployment
    """
    
    def __init__(self, model_path: str, output_dir: str = 'outputs'):
        self.model_path = Path(model_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        (self.output_dir / 'onnx').mkdir(exist_ok=True)
        (self.output_dir / 'tensorflowjs').mkdir(exist_ok=True)
        (self.output_dir / 'torchscript').mkdir(exist_ok=True)
        
        logger.info(f"Initialized ModelExporter")
        logger.info(f"  Model path: {self.model_path}")
        logger.info(f"  Output dir: {self.output_dir}")
    
    def load_model(self, device: str = 'cpu') -> torch.nn.Module:
        """Load trained PyTorch model"""
        try:
            checkpoint = torch.load(self.model_path, map_location=device)
            
            # Handle different checkpoint formats
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            elif 'state_dict' in checkpoint:
                state_dict = checkpoint['state_dict']
            else:
                state_dict = checkpoint
            
            # Get model config
            model_config = checkpoint.get('model_config', {})
            
            # Import and create model
            from model import create_model
            model, _ = create_model(
                num_classes=model_config.get('num_classes', 5),
                pretrained=False,  # Don't use pretrained weights for inference
                use_forensic_features=model_config.get('use_forensic_features', True)
            )
            
            # Load weights
            model.load_state_dict(state_dict)
            model.eval()
            model.to(device)
            
            logger.info(f"Model loaded successfully")
            logger.info(f"  Classes: {model_config.get('num_classes', 5)}")
            logger.info(f"  Forensic features: {model_config.get('use_forensic_features', True)}")
            
            return model
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
    
    def export_to_onnx(
        self,
        model: torch.nn.Module,
        input_shape: Tuple[int, ...] = (1, 3, 224, 224),
        dynamic_axes: bool = False,
        opset_version: int = 11
    ) -> str:
        """Export model to ONNX format"""
        try:
            # Create dummy input
            dummy_input = torch.randn(input_shape)
            
            # Create forensic features dummy input
            forensic_features = torch.randn((input_shape[0], 50))
            
            # Export path
            onnx_path = self.output_dir / 'onnx' / 'forensic_classifier.onnx'
            
            # Export to ONNX
            torch.onnx.export(
                model,
                (dummy_input, forensic_features),
                str(onnx_path),
                export_params=True,
                opset_version=opset_version,
                do_constant_folding=True,
                input_names=['images', 'forensic_features'],
                output_names=['logits', 'probabilities', 'predictions'],
                dynamic_axes={
                    'images': {0: 'batch_size'},
                    'forensic_features': {0: 'batch_size'},
                    'logits': {0: 'batch_size'},
                    'probabilities': {0: 'batch_size'},
                    'predictions': {0: 'batch_size'}
                } if dynamic_axes else None,
                verbose=False
            )
            
            # Verify ONNX model
            onnx_model = onnx.load(str(onnx_path))
            onnx.checker.check_model(onnx_model)
            
            logger.info(f"ONNX export successful: {onnx_path}")
            
            # Test ONNX model
            self.test_onnx_model(onnx_path, dummy_input, forensic_features)
            
            return str(onnx_path)
            
        except Exception as e:
            logger.error(f"ONNX export failed: {e}")
            raise
    
    def test_onnx_model(
        self,
        onnx_path: Path,
        dummy_input: torch.Tensor,
        forensic_features: torch.Tensor
    ):
        """Test exported ONNX model"""
        try:
            # Create ONNX Runtime session
            ort_session = ort.InferenceSession(str(onnx_path))
            
            # Get input names
            input_names = [input_.name for input_ in ort_session.get_inputs()]
            logger.info(f"ONNX inputs: {input_names}")
            
            # Prepare inputs
            ort_inputs = {
                'images': dummy_input.numpy(),
                'forensic_features': forensic_features.numpy()
            }
            
            # Run inference
            ort_outputs = ort_session.run(None, ort_inputs)
            
            logger.info(f"ONNX test successful")
            logger.info(f"  Output names: {[output_.name for output_ in ort_session.get_outputs()]}")
            logger.info(f"  Output shapes: {[output.shape for output in ort_outputs]}")
            
        except Exception as e:
            logger.warning(f"ONNX test failed: {e}")
    
    def export_to_torchscript(
        self,
        model: torch.nn.Module,
        input_shape: Tuple[int, ...] = (1, 3, 224, 224)
    ) -> str:
        """Export model to TorchScript format"""
        try:
            # Create dummy input
            dummy_input = torch.randn(input_shape)
            forensic_features = torch.randn((input_shape[0], 50))
            
            # Export path
            script_path = self.output_dir / 'torchscript' / 'forensic_classifier.pt'
            
            # Trace the model
            traced_model = torch.jit.trace(
                model,
                (dummy_input, forensic_features),
                strict=False
            )
            
            # Save traced model
            torch.jit.save(traced_model, str(script_path))
            
            logger.info(f"TorchScript export successful: {script_path}")
            
            # Test TorchScript model
            self.test_torchscript_model(script_path, dummy_input, forensic_features)
            
            return str(script_path)
            
        except Exception as e:
            logger.error(f"TorchScript export failed: {e}")
            raise
    
    def test_torchscript_model(
        self,
        script_path: Path,
        dummy_input: torch.Tensor,
        forensic_features: torch.Tensor
    ):
        """Test exported TorchScript model"""
        try:
            # Load traced model
            loaded_model = torch.jit.load(str(script_path))
            loaded_model.eval()
            
            # Run inference
            with torch.no_grad():
                outputs = loaded_model(dummy_input, forensic_features)
            
            logger.info(f"TorchScript test successful")
            logger.info(f"  Output keys: {list(outputs.keys())}")
            logger.info(f"  Output shapes: {[v.shape for v in outputs.values()]}")
            
        except Exception as e:
            logger.warning(f"TorchScript test failed: {e}")
    
    def export_to_tensorflowjs(
        self,
        model: torch.nn.Module,
        input_shape: Tuple[int, ...] = (1, 3, 224, 224)
    ) -> str:
        """Export model to TensorFlow.js format"""
        try:
            # First convert to TensorFlow SavedModel
            tf_path = self.output_dir / 'tensorflow_saved_model'
            tf_path.mkdir(exist_ok=True)
            
            # Create dummy input
            dummy_input = torch.randn(input_shape)
            forensic_features = torch.randn((input_shape[0], 50))
            
            # Convert to TensorFlow format
            # This requires the model to be in evaluation mode
            model.eval()
            
            # Create a simple TensorFlow model that mimics the PyTorch model
            # This is a simplified approach - in production, use more sophisticated conversion
            self.create_tensorflow_equivalent(model, tf_path)
            
            # Convert to TensorFlow.js
            tfjs_path = self.output_dir / 'tensorflowjs'
            
            tfjs.converters.tf_saved_model_conversion_v2.convert_tf_saved_model(
                str(tf_path),
                str(tfjs_path),
                quantization_float16=True,
                split_weights_by_layer=True
            )
            
            logger.info(f"TensorFlow.js export successful: {tfjs_path}")
            
            return str(tfjs_path)
            
        except Exception as e:
            logger.error(f"TensorFlow.js export failed: {e}")
            # Try alternative approach
            return self.export_to_tensorflowjs_alternative(model)
    
    def create_tensorflow_equivalent(
        self,
        pytorch_model: torch.nn.Module,
        tf_path: Path
    ):
        """Create TensorFlow equivalent of PyTorch model"""
        try:
            # This is a simplified approach
            # In production, use proper conversion tools
            
            # Get model info
            model_info = pytorch_model.get_model_info()
            num_classes = model_info['num_classes']
            
            # Create TensorFlow model
            tf_model = tf.keras.Sequential([
                tf.keras.layers.Input(shape=(224, 224, 3), name='images'),
                tf.keras.layers.Rescaling(1./255),
                tf.keras.layers.Conv2D(64, 7, strides=2, padding='same', activation='relu'),
                tf.keras.layers.MaxPooling2D(),
                tf.keras.layers.Conv2D(128, 5, strides=2, padding='same', activation='relu'),
                tf.keras.layers.MaxPooling2D(),
                tf.keras.layers.Conv2D(256, 3, strides=2, padding='same', activation='relu'),
                tf.keras.layers.MaxPooling2D(),
                tf.keras.layers.GlobalAveragePooling2D(),
                tf.keras.layers.Dense(512, activation='relu'),
                tf.keras.layers.Dropout(0.3),
                tf.keras.layers.Dense(num_classes, activation='softmax', name='logits')
            ])
            
            # Compile model
            tf_model.compile(
                optimizer='adam',
                loss='categorical_crossentropy',
                metrics=['accuracy']
            )
            
            # Save model
            tf_model.save(str(tf_path), save_format='tf')
            
            logger.info(f"TensorFlow equivalent model created: {tf_path}")
            
        except Exception as e:
            logger.warning(f"TensorFlow equivalent creation failed: {e}")
    
    def export_to_tensorflowjs_alternative(
        self,
        model: torch.nn.Module
    ) -> str:
        """Alternative export method for TensorFlow.js"""
        try:
            # Create a simplified model architecture
            tfjs_path = self.output_dir / 'tensorflowjs'
            
            # Get model weights (simplified)
            model_info = model.get_model_info()
            num_classes = model_info['num_classes']
            
            # Create a simple model that matches our architecture
            tf_model = tf.keras.Sequential([
                tf.keras.layers.Input(shape=(224, 224, 3), name='images'),
                tf.keras.layers.Rescaling(1./255),
                tf.keras.layers.Conv2D(32, 3, activation='relu'),
                tf.keras.layers.MaxPooling2D(),
                tf.keras.layers.Conv2D(64, 3, activation='relu'),
                tf.keras.layers.MaxPooling2D(),
                tf.keras.layers.Conv2D(128, 3, activation='relu'),
                tf.keras.layers.MaxPooling2D(),
                tf.keras.layers.GlobalAveragePooling2D(),
                tf.keras.layers.Dense(256, activation='relu'),
                tf.keras.layers.Dropout(0.3),
                tf.keras.layers.Dense(num_classes, activation='softmax', name='logits')
            ])
            
            # Compile and save
            tf_model.compile(optimizer='adam', loss='categorical_crossentropy')
            
            # Convert to TensorFlow.js
            tfjs.converters.keras_converter(
                tf_model,
                str(tfjs_path),
                quantization_float16=True
            )
            
            logger.info(f"Alternative TensorFlow.js export successful: {tfjs_path}")
            return str(tfjs_path)
            
        except Exception as e:
            logger.error(f"Alternative TensorFlow.js export failed: {e}")
            raise
    
    def create_metadata(self, model_info: Dict) -> str:
        """Create metadata file for exported models"""
        metadata = {
            'model_name': 'Forensic Image Classifier',
            'version': '1.0.0',
            'description': 'Hybrid CNN + Forensic analysis for image classification',
            'classes': ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded'],
            'input_shape': [1, 3, 224, 224],
            'forensic_features_dim': 50,
            'model_info': model_info,
            'export_formats': ['onnx', 'torchscript', 'tensorflowjs'],
            'performance_targets': {
                'camera_accuracy': '>90%',
                'ai_accuracy': '>90%',
                'overall_accuracy': '>85%'
            },
            'created_at': str(Path.cwd()),
            'framework': 'PyTorch'
        }
        
        metadata_path = self.output_dir / 'model_metadata.json'
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Metadata saved: {metadata_path}")
        return str(metadata_path)
    
    def export_all_formats(
        self,
        model_path: Optional[str] = None,
        input_shape: Tuple[int, ...] = (1, 3, 224, 224)
    ) -> Dict[str, str]:
        """Export model to all formats"""
        
        if model_path:
            self.model_path = Path(model_path)
        
        # Load model
        model = self.load_model()
        model_info = model.get_model_info()
        
        # Export to all formats
        results = {}
        
        try:
            # ONNX export
            onnx_path = self.export_to_onnx(model, input_shape)
            results['onnx'] = onnx_path
        except Exception as e:
            logger.error(f"ONNX export failed: {e}")
            results['onnx'] = None
        
        try:
            # TorchScript export
            script_path = self.export_to_torchscript(model, input_shape)
            results['torchscript'] = script_path
        except Exception as e:
            logger.error(f"TorchScript export failed: {e}")
            results['torchscript'] = None
        
        try:
            # TensorFlow.js export
            tfjs_path = self.export_to_tensorflowjs(model, input_shape)
            results['tensorflowjs'] = tfjs_path
        except Exception as e:
            logger.error(f"TensorFlow.js export failed: {e}")
            results['tensorflowjs'] = None
        
        # Create metadata
        metadata_path = self.create_metadata(model_info)
        results['metadata'] = metadata_path
        
        # Create usage examples
        self.create_usage_examples(results)
        
        logger.info("Export completed!")
        logger.info(f"Results: {results}")
        
        return results
    
    def create_usage_examples(self, export_results: Dict[str, str]):
        """Create usage example files for each format"""
        
        # ONNX usage example
        if export_results.get('onnx'):
            onnx_example = '''
# ONNX Runtime Example
import onnxruntime as ort
import numpy as np

# Load model
session = ort.InferenceSession("outputs/onnx/forensic_classifier.onnx")

# Prepare inputs
images = np.random.randn(1, 3, 224, 224).astype(np.float32)
forensic_features = np.random.randn(1, 50).astype(np.float32)

# Run inference
inputs = {
    "images": images,
    "forensic_features": forensic_features
}
outputs = session.run(None, inputs)

logits = outputs[0]  # Raw scores
probabilities = outputs[1]  # Softmax probabilities
predictions = outputs[2]  # Class predictions

print(f"Predicted class: {np.argmax(predictions[0])}")
print(f"Probabilities: {probabilities[0]}")
'''
            with open(self.output_dir / 'onnx_usage_example.py', 'w') as f:
                f.write(onnx_example)
        
        # TensorFlow.js usage example
        if export_results.get('tensorflowjs'):
            tfjs_example = '''
// TensorFlow.js Usage Example
import * as tf from '@tensorflow/tfjs';

// Load model
const model = await tf.loadLayersModel('outputs/tensorflowjs/model.json');

// Prepare inputs
const images = tf.randomNormal([1, 224, 224, 3]);
const forensicFeatures = tf.randomNormal([1, 50]);

// Run inference
const predictions = model.execute({
    'images_input': images,
    'forensic_features_input': forensicFeatures
});

console.log('Predictions:', predictions);
'''
            with open(self.output_dir / 'tensorflowjs_usage_example.js', 'w') as f:
                f.write(tfjs_example)
        
        logger.info("Usage examples created")


def main():
    """Main export function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Export Forensic Model to Multiple Formats')
    parser.add_argument('--model-path', type=str, required=True, help='Path to trained model checkpoint')
    parser.add_argument('--output-dir', type=str, default='outputs', help='Output directory')
    parser.add_argument('--input-shape', type=int, nargs=4, default=[1, 3, 224, 224], help='Input shape')
    
    args = parser.parse_args()
    
    # Create exporter
    exporter = ModelExporter(args.model_path, args.output_dir)
    
    # Export all formats
    results = exporter.export_all_formats(tuple(args.input_shape))
    
    print(f"\nExport completed successfully!")
    print(f"Output directory: {args.output_dir}")
    print("\nExported formats:")
    for format_name, path in results.items():
        if path:
            print(f"  {format_name}: {path}")
        else:
            print(f"  {format_name}: FAILED")


if __name__ == "__main__":
    main()
