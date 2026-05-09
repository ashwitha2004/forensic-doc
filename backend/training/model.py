"""
EfficientNet-B3 CNN Model for Forensic Image Classification
Production-grade model with transfer learning and multi-class support
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import timm
import logging
from typing import Dict, Tuple, Optional
import math

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ForensicClassifier(nn.Module):
    """
    EfficientNet-B3 based forensic image classifier
    Classes: camera, ai, screenshot, whatsapp, downloaded
    """
    
    def __init__(
        self,
        num_classes: int = 5,
        pretrained: bool = True,
        dropout_rate: float = 0.3,
        forensic_features_dim: int = 50,
        use_forensic_features: bool = True
    ):
        super(ForensicClassifier, self).__init__()
        
        self.num_classes = num_classes
        self.use_forensic_features = use_forensic_features
        self.forensic_features_dim = forensic_features_dim
        
        # Load pretrained EfficientNet-B3
        self.backbone = timm.create_model(
            'efficientnet_b3',
            pretrained=pretrained,
            num_classes=0,  # Remove classifier head
            global_pool='avg'  # Global average pooling
        )
        
        # Get feature dimension
        backbone_dim = self.backbone.num_features
        
        # Feature processing layers
        self.feature_processor = nn.Sequential(
            nn.Linear(backbone_dim, 1024),
            nn.BatchNorm1d(1024),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate),
            
            nn.Linear(1024, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate),
            
            nn.Linear(512, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate * 0.5)
        )
        
        # Forensic feature processor (if enabled)
        if self.use_forensic_features:
            self.forensic_processor = nn.Sequential(
                nn.Linear(self.forensic_features_dim, 128),
                nn.BatchNorm1d(128),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout_rate * 0.5),
                
                nn.Linear(128, 64),
                nn.BatchNorm1d(64),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout_rate * 0.5)
            )
            
            # Combined feature dimension
            combined_dim = 256 + 64
        else:
            combined_dim = 256
        
        # Final classifier
        self.classifier = nn.Sequential(
            nn.Linear(combined_dim, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate * 0.5),
            
            nn.Linear(128, num_classes)
        )
        
        # Initialize weights
        self._initialize_weights()
        
        logger.info(f"Initialized ForensicClassifier:")
        logger.info(f"  Backbone: EfficientNet-B3 (pretrained={pretrained})")
        logger.info(f"  Feature dim: {backbone_dim}")
        logger.info(f"  Forensic features: {use_forensic_features}")
        logger.info(f"  Forensic dim: {forensic_features_dim if use_forensic_features else 0}")
        logger.info(f"  Num classes: {num_classes}")
    
    def forward(self, images: torch.Tensor, forensic_features: Optional[torch.Tensor] = None) -> Dict[str, torch.Tensor]:
        """
        Forward pass
        
        Args:
            images: Input images (batch_size, 3, 224, 224)
            forensic_features: Optional forensic features (batch_size, forensic_features_dim)
            
        Returns:
            Dictionary with logits and probabilities
        """
        batch_size = images.size(0)
        
        # Extract CNN features
        cnn_features = self.backbone(images)  # (batch_size, backbone_dim)
        
        # Process CNN features
        processed_features = self.feature_processor(cnn_features)  # (batch_size, 256)
        
        # Process forensic features if available
        if self.use_forensic_features and forensic_features is not None:
            forensic_processed = self.forensic_processor(forensic_features)  # (batch_size, 64)
            # Concatenate features
            combined_features = torch.cat([processed_features, forensic_processed], dim=1)  # (batch_size, 320)
        else:
            # Use only CNN features
            combined_features = processed_features
        
        # Final classification
        logits = self.classifier(combined_features)  # (batch_size, num_classes)
        
        # Calculate probabilities
        probabilities = F.softmax(logits, dim=1)
        
        return {
            'logits': logits,
            'probabilities': probabilities,
            'predictions': torch.argmax(logits, dim=1)
        }
    
    def _initialize_weights(self):
        """Initialize weights for custom layers"""
        for m in self.modules():
            if isinstance(m, nn.Linear):
                # Xavier initialization for linear layers
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.BatchNorm1d):
                # Standard initialization for batch norm
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
    
    def get_model_info(self) -> Dict:
        """Get model information"""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        
        return {
            'total_parameters': total_params,
            'trainable_parameters': trainable_params,
            'backbone_parameters': sum(p.numel() for p in self.backbone.parameters()),
            'custom_parameters': total_params - sum(p.numel() for p in self.backbone.parameters()),
            'model_size_mb': total_params * 4 / (1024 * 1024),  # Assuming float32
            'num_classes': self.num_classes,
            'use_forensic_features': self.use_forensic_features
        }


class FocalLoss(nn.Module):
    """
    Focal Loss for handling class imbalance
    """
    
    def __init__(self, alpha: float = 1.0, gamma: float = 2.0, reduction: str = 'mean'):
        super(FocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.reduction = reduction
    
    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce_loss = F.cross_entropy(inputs, targets, reduction='none')
        pt = torch.exp(-ce_loss)
        focal_loss = self.alpha * (1 - pt) ** self.gamma * ce_loss
        
        if self.reduction == 'mean':
            return focal_loss.mean()
        elif self.reduction == 'sum':
            return focal_loss.sum()
        else:
            return focal_loss


class LabelSmoothingLoss(nn.Module):
    """
    Label Smoothing for better generalization
    """
    
    def __init__(self, smoothing: float = 0.1, reduction: str = 'mean'):
        super(LabelSmoothingLoss, self).__init__()
        self.smoothing = smoothing
        self.reduction = reduction
        self.confidence = 1.0 - smoothing
    
    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        log_probs = F.log_softmax(inputs, dim=1)
        
        # Create smooth labels
        smooth_targets = torch.zeros_like(log_probs)
        smooth_targets.fill_(self.smoothing / (inputs.size(1) - 1))
        smooth_targets.scatter_(1, targets.unsqueeze(1), self.confidence)
        
        # Calculate loss
        loss = -torch.sum(smooth_targets * log_probs, dim=1)
        
        if self.reduction == 'mean':
            return loss.mean()
        elif self.reduction == 'sum':
            return loss.sum()
        else:
            return loss


class EarlyStopping:
    """
    Early stopping to prevent overfitting
    """
    
    def __init__(self, patience: int = 7, min_delta: float = 0.001, restore_best_weights: bool = True):
        self.patience = patience
        self.min_delta = min_delta
        self.restore_best_weights = restore_best_weights
        self.best_loss = float('inf')
        self.counter = 0
        self.best_weights = None
    
    def __call__(self, val_loss: float, model: nn.Module) -> bool:
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
            if self.restore_best_weights:
                self.best_weights = model.state_dict().copy()
        else:
            self.counter += 1
        
        if self.counter >= self.patience:
            if self.restore_best_weights and self.best_weights is not None:
                model.load_state_dict(self.best_weights)
                logger.info("Restored best weights from early stopping")
            return True
        
        return False


def create_model(
    num_classes: int = 5,
    pretrained: bool = True,
    dropout_rate: float = 0.3,
    forensic_features_dim: int = 50,
    use_forensic_features: bool = True,
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
) -> Tuple[nn.Module, str]:
    """
    Create and configure the model
    """
    
    model = ForensicClassifier(
        num_classes=num_classes,
        pretrained=pretrained,
        dropout_rate=dropout_rate,
        forensic_features_dim=forensic_features_dim,
        use_forensic_features=use_forensic_features
    )
    
    model = model.to(device)
    
    # Print model info
    model_info = model.get_model_info()
    logger.info("Model Information:")
    for key, value in model_info.items():
        logger.info(f"  {key}: {value}")
    
    return model, device


def test_model():
    """Test model with dummy input"""
    model, device = create_model()
    
    # Create dummy inputs
    batch_size = 4
    images = torch.randn(batch_size, 3, 224, 224).to(device)
    forensic_features = torch.randn(batch_size, 50).to(device)
    
    # Forward pass
    with torch.no_grad():
        outputs = model(images, forensic_features)
    
    print("Model Test Results:")
    for key, value in outputs.items():
        print(f"  {key}: {value.shape}")
    
    print(f"Device: {device}")
    print(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")


if __name__ == "__main__":
    test_model()
