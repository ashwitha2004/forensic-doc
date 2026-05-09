"""
Forensic Image Dataset Pipeline
Supports ImageFolder format with automatic validation and preprocessing
"""

import os
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image
import numpy as np
import cv2
from pathlib import Path
import logging
from typing import Tuple, Optional, Dict, Any
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ForensicDataset(Dataset):
    """
    Dataset for forensic image classification
    Classes: camera, ai, screenshot, whatsapp, downloaded
    """
    
    def __init__(
        self,
        root_dir: str,
        transform: Optional[transforms.Compose] = None,
        forensic_transform: Optional[transforms.Compose] = None,
        validate: bool = True
    ):
        self.root_dir = Path(root_dir)
        self.transform = transform
        self.forensic_transform = forensic_transform
        self.validate = validate
        
        # Define class mapping
        self.class_to_idx = {
            'camera': 0,
            'ai': 1, 
            'screenshot': 2,
            'whatsapp': 3,
            'downloaded': 4
        }
        
        self.idx_to_class = {v: k for k, v in self.class_to_idx.items()}
        
        # Load image paths and labels
        self.samples = []
        self.load_dataset()
        
        if validate:
            self.validate_dataset()
    
    def load_dataset(self):
        """Load dataset with ImageFolder structure"""
        logger.info(f"Loading dataset from {self.root_dir}")
        
        for class_name in self.class_to_idx.keys():
            class_dir = self.root_dir / class_name
            if not class_dir.exists():
                logger.warning(f"Class directory not found: {class_dir}")
                continue
                
            class_idx = self.class_to_idx[class_name]
            
            # Get all image files
            image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
            for img_path in class_dir.rglob('*'):
                if img_path.suffix.lower() in image_extensions:
                    self.samples.append((str(img_path), class_idx))
        
        logger.info(f"Loaded {len(self.samples)} samples")
        
        # Print class distribution
        class_counts = {}
        for _, class_idx in self.samples:
            class_name = self.idx_to_class[class_idx]
            class_counts[class_name] = class_counts.get(class_name, 0) + 1
        
        for class_name, count in class_counts.items():
            logger.info(f"  {class_name}: {count} samples")
    
    def validate_dataset(self):
        """Validate dataset integrity"""
        logger.info("Validating dataset...")
        
        corrupted = 0
        grayscale = 0
        valid = 0
        
        for img_path, class_idx in self.samples:
            try:
                # Check if image can be loaded
                with Image.open(img_path) as img:
                    # Check for grayscale
                    if img.mode == 'L':
                        grayscale += 1
                        # Convert to RGB for consistency
                        img = img.convert('RGB')
                        img.save(img_path)
                    
                    # Check image dimensions
                    if img.size[0] < 32 or img.size[1] < 32:
                        logger.warning(f"Very small image: {img_path} - {img.size}")
                    
                    valid += 1
                    
            except Exception as e:
                logger.error(f"Corrupted image: {img_path} - {e}")
                corrupted += 1
                # Remove corrupted image
                try:
                    os.remove(img_path)
                except:
                    pass
        
        logger.info(f"Dataset validation complete:")
        logger.info(f"  Valid images: {valid}")
        logger.info(f"  Corrupted images: {corrupted}")
        logger.info(f"  Grayscale images converted: {grayscale}")
    
    def __len__(self) -> int:
        return len(self.samples)
    
    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, Dict[str, Any]]:
        img_path, class_idx = self.samples[idx]
        
        try:
            # Load image
            image = Image.open(img_path).convert('RGB')
            
            # Extract forensic features
            forensic_features = self.extract_forensic_features(img_path, image)
            
            # Apply transforms
            if self.transform:
                image = self.transform(image)
            
            if self.forensic_transform:
                forensic_image = self.forensic_transform(image)
            else:
                forensic_image = image
            
            return forensic_image, class_idx, forensic_features
            
        except Exception as e:
            logger.error(f"Error loading {img_path}: {e}")
            # Return a dummy sample
            dummy_image = torch.zeros((3, 224, 224))
            dummy_features = {key: 0.0 for key in self.get_forensic_feature_names()}
            return dummy_image, class_idx, dummy_features
    
    def extract_forensic_features(self, img_path: str, image: Image.Image) -> Dict[str, float]:
        """Extract forensic features for hybrid analysis"""
        features = {}
        
        try:
            # Convert to numpy array
            img_array = np.array(image)
            
            # 1. Basic image properties
            features['width'] = image.size[0]
            features['height'] = image.size[1]
            features['aspect_ratio'] = image.size[0] / image.size[1]
            features['file_size'] = os.path.getsize(img_path)
            
            # 2. Color distribution features
            features['mean_r'] = np.mean(img_array[:, :, 0])
            features['mean_g'] = np.mean(img_array[:, :, 1])
            features['mean_b'] = np.mean(img_array[:, :, 2])
            features['std_r'] = np.std(img_array[:, :, 0])
            features['std_g'] = np.std(img_array[:, :, 1])
            features['std_b'] = np.std(img_array[:, :, 2])
            
            # 3. Texture features
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            features['texture_variance'] = np.var(gray)
            
            # 4. Edge features
            edges = cv2.Canny(gray, 50, 150)
            features['edge_density'] = np.sum(edges > 0) / edges.size
            
            # 5. Frequency domain features
            fft = np.fft.fft2(gray)
            fft_magnitude = np.abs(fft)
            features['fft_mean'] = np.mean(fft_magnitude)
            features['fft_std'] = np.std(fft_magnitude)
            
            # 6. Compression artifacts (simplified)
            features['compression_score'] = self.estimate_compression_artifacts(img_array)
            
        except Exception as e:
            logger.warning(f"Error extracting features from {img_path}: {e}")
            # Return zeros if extraction fails
            features = {key: 0.0 for key in self.get_forensic_feature_names()}
        
        return features
    
    def estimate_compression_artifacts(self, img_array: np.ndarray) -> float:
        """Estimate compression artifacts using blockiness detection"""
        try:
            gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
            
            # Calculate blockiness (8x8 blocks for JPEG)
            h, w = gray.shape
            block_size = 8
            
            blockiness = 0
            block_count = 0
            
            for i in range(0, h - block_size, block_size):
                for j in range(0, w - block_size, block_size):
                    block = gray[i:i+block_size, j:j+block_size]
                    
                    # Calculate horizontal and vertical differences
                    h_diff = np.mean(np.abs(np.diff(block, axis=0)))
                    v_diff = np.mean(np.abs(np.diff(block, axis=1)))
                    
                    blockiness += (h_diff + v_diff) / 2
                    block_count += 1
            
            return blockiness / max(block_count, 1)
            
        except:
            return 0.0
    
    def get_forensic_feature_names(self) -> list:
        """Get list of forensic feature names"""
        return [
            'width', 'height', 'aspect_ratio', 'file_size',
            'mean_r', 'mean_g', 'mean_b', 'std_r', 'std_g', 'std_b',
            'texture_variance', 'edge_density', 'fft_mean', 'fft_std',
            'compression_score'
        ]
    
    def get_class_weights(self) -> torch.Tensor:
        """Calculate class weights for imbalanced dataset"""
        class_counts = {}
        for _, class_idx in self.samples:
            class_name = self.idx_to_class[class_idx]
            class_counts[class_name] = class_counts.get(class_name, 0) + 1
        
        total_samples = len(self.samples)
        num_classes = len(self.class_to_idx)
        
        weights = []
        for class_name in self.class_to_idx.keys():
            count = class_counts.get(class_name, 1)
            weight = total_samples / (num_classes * count)
            weights.append(weight)
        
        return torch.FloatTensor(weights)


def create_data_loaders(
    train_dir: str,
    val_dir: str,
    batch_size: int = 32,
    num_workers: int = 4,
    forensic_features: bool = True
) -> Tuple[DataLoader, DataLoader]:
    """Create train and validation data loaders"""
    
    # Data augmentation for training
    train_transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomCrop(224),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(degrees=10),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    # Validation transform (no augmentation)
    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    # Create datasets
    train_dataset = ForensicDataset(
        root_dir=train_dir,
        transform=train_transform,
        validate=True
    )
    
    val_dataset = ForensicDataset(
        root_dir=val_dir,
        transform=val_transform,
        validate=False
    )
    
    # Create data loaders
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True,
        drop_last=True
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
        drop_last=False
    )
    
    logger.info(f"Created data loaders:")
    logger.info(f"  Train: {len(train_dataset)} samples")
    logger.info(f"  Val: {len(val_dataset)} samples")
    logger.info(f"  Batch size: {batch_size}")
    
    return train_loader, val_loader


if __name__ == "__main__":
    # Test dataset loading
    train_loader, val_loader = create_data_loaders(
        "datasets/train",
        "datasets/val",
        batch_size=16
    )
    
    # Test one batch
    for images, labels, forensic_features in train_loader:
        print(f"Images shape: {images.shape}")
        print(f"Labels shape: {labels.shape}")
        print(f"Forensic features keys: {list(forensic_features.keys())}")
        break
