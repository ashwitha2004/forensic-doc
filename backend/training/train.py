"""
Training Script for Forensic Image Classifier
Production-grade training with comprehensive metrics and logging
"""

import os
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torch.utils.tensorboard import SummaryWriter
import numpy as np
from tqdm import tqdm
import json
import argparse
from datetime import datetime
import logging
from typing import Dict, Tuple, Optional
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path

# Import our modules
from dataset import create_data_loaders, ForensicDataset
from model import create_model, FocalLoss, LabelSmoothingLoss, EarlyStopping
from forensic.feature_extractors import ForensicFeatureExtractor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('training.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class ForensicTrainer:
    """
    Production-grade trainer for forensic image classification
    """
    
    def __init__(
        self,
        model: nn.Module,
        train_loader: DataLoader,
        val_loader: DataLoader,
        device: str,
        output_dir: str = 'outputs',
        experiment_name: str = 'forensic_classifier'
    ):
        self.model = model
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.device = device
        self.output_dir = Path(output_dir)
        self.experiment_name = experiment_name
        
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_dir = self.output_dir / 'checkpoints'
        self.checkpoint_dir.mkdir(exist_ok=True)
        
        # Initialize forensic feature extractor
        self.forensic_extractor = ForensicFeatureExtractor()
        
        # Training components
        self.criterion = None
        self.optimizer = None
        self.scheduler = None
        self.early_stopping = None
        
        # Metrics tracking
        self.train_losses = []
        self.val_losses = []
        self.train_accuracies = []
        self.val_accuracies = []
        self.best_val_accuracy = 0.0
        self.best_val_loss = float('inf')
        
        # TensorBoard writer
        self.writer = SummaryWriter(self.output_dir / 'tensorboard' / experiment_name)
        
        logger.info(f"Initialized trainer for {experiment_name}")
        logger.info(f"Output directory: {self.output_dir}")
    
    def setup_training(
        self,
        learning_rate: float = 1e-4,
        weight_decay: float = 1e-5,
        loss_type: str = 'focal',
        focal_alpha: float = 1.0,
        focal_gamma: float = 2.0,
        label_smoothing: float = 0.1,
        scheduler_type: str = 'cosine',
        patience: int = 10,
        min_delta: float = 0.001
    ):
        """Setup training components"""
        
        # Setup loss function
        if loss_type == 'focal':
            self.criterion = FocalLoss(alpha=focal_alpha, gamma=focal_gamma)
        elif loss_type == 'label_smoothing':
            self.criterion = LabelSmoothingLoss(smoothing=label_smoothing)
        else:
            self.criterion = nn.CrossEntropyLoss()
        
        # Setup optimizer
        self.optimizer = optim.AdamW(
            self.model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay,
            betas=(0.9, 0.999),
            eps=1e-8
        )
        
        # Setup scheduler
        if scheduler_type == 'cosine':
            self.scheduler = optim.lr_scheduler.CosineAnnealingLR(
                self.optimizer, T_max=100, eta_min=1e-6
            )
        elif scheduler_type == 'step':
            self.scheduler = optim.lr_scheduler.StepLR(
                self.optimizer, step_size=30, gamma=0.1
            )
        else:
            self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
                self.optimizer, mode='min', factor=0.5, patience=5
            )
        
        # Setup early stopping
        self.early_stopping = EarlyStopping(
            patience=patience,
            min_delta=min_delta,
            restore_best_weights=True
        )
        
        logger.info(f"Training setup:")
        logger.info(f"  Loss: {loss_type}")
        logger.info(f"  Optimizer: AdamW (lr={learning_rate}, wd={weight_decay})")
        logger.info(f"  Scheduler: {scheduler_type}")
        logger.info(f"  Early stopping patience: {patience}")
    
    def train_epoch(self, epoch: int) -> Tuple[float, float]:
        """Train for one epoch"""
        self.model.train()
        
        running_loss = 0.0
        correct_predictions = 0
        total_samples = 0
        
        # Progress bar
        pbar = tqdm(self.train_loader, desc=f'Epoch {epoch+1} [Train]')
        
        for batch_idx, (images, labels, forensic_data) in enumerate(pbar):
            # Move data to device
            images = images.to(self.device)
            labels = labels.to(self.device)
            
            # Extract forensic features if needed
            if hasattr(self.model, 'use_forensic_features') and self.model.use_forensic_features:
                forensic_features = []
                for i in range(images.size(0)):
                    # This is simplified - in production, extract from original image paths
                    feature_vector = torch.zeros(50).to(self.device)  # Placeholder
                    forensic_features.append(feature_vector)
                forensic_features = torch.stack(forensic_features)
            else:
                forensic_features = None
            
            # Zero gradients
            self.optimizer.zero_grad()
            
            # Forward pass
            outputs = self.model(images, forensic_features)
            logits = outputs['logits']
            
            # Calculate loss
            loss = self.criterion(logits, labels)
            
            # Backward pass
            loss.backward()
            
            # Gradient clipping
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            
            # Update weights
            self.optimizer.step()
            
            # Update metrics
            running_loss += loss.item()
            predictions = outputs['predictions']
            correct_predictions += (predictions == labels).sum().item()
            total_samples += labels.size(0)
            
            # Update progress bar
            current_loss = running_loss / (batch_idx + 1)
            current_acc = correct_predictions / total_samples
            pbar.set_postfix({
                'Loss': f'{current_loss:.4f}',
                'Acc': f'{current_acc:.4f}'
            })
            
            # Log to TensorBoard
            global_step = epoch * len(self.train_loader) + batch_idx
            self.writer.add_scalar('Train/BatchLoss', loss.item(), global_step)
            self.writer.add_scalar('Train/BatchAccuracy', current_acc, global_step)
        
        # Calculate epoch metrics
        epoch_loss = running_loss / len(self.train_loader)
        epoch_accuracy = correct_predictions / total_samples
        
        self.train_losses.append(epoch_loss)
        self.train_accuracies.append(epoch_accuracy)
        
        logger.info(f'Epoch {epoch+1} Train - Loss: {epoch_loss:.4f}, Acc: {epoch_accuracy:.4f}')
        
        return epoch_loss, epoch_accuracy
    
    def validate_epoch(self, epoch: int) -> Tuple[float, float, Dict]:
        """Validate for one epoch"""
        self.model.eval()
        
        running_loss = 0.0
        correct_predictions = 0
        total_samples = 0
        all_predictions = []
        all_labels = []
        all_probabilities = []
        
        with torch.no_grad():
            pbar = tqdm(self.val_loader, desc=f'Epoch {epoch+1} [Val]')
            
            for images, labels, forensic_data in pbar:
                # Move data to device
                images = images.to(self.device)
                labels = labels.to(self.device)
                
                # Extract forensic features if needed
                if hasattr(self.model, 'use_forensic_features') and self.model.use_forensic_features:
                    forensic_features = []
                    for i in range(images.size(0)):
                        feature_vector = torch.zeros(50).to(self.device)  # Placeholder
                        forensic_features.append(feature_vector)
                    forensic_features = torch.stack(forensic_features)
                else:
                    forensic_features = None
                
                # Forward pass
                outputs = self.model(images, forensic_features)
                logits = outputs['logits']
                probabilities = outputs['probabilities']
                predictions = outputs['predictions']
                
                # Calculate loss
                loss = self.criterion(logits, labels)
                
                # Update metrics
                running_loss += loss.item()
                correct_predictions += (predictions == labels).sum().item()
                total_samples += labels.size(0)
                
                # Store for detailed metrics
                all_predictions.extend(predictions.cpu().numpy())
                all_labels.extend(labels.cpu().numpy())
                all_probabilities.extend(probabilities.cpu().numpy())
                
                # Update progress bar
                current_loss = running_loss / (len(pbar) if pbar.n > 0 else 1)
                current_acc = correct_predictions / total_samples
                pbar.set_postfix({
                    'Loss': f'{current_loss:.4f}',
                    'Acc': f'{current_acc:.4f}'
                })
        
        # Calculate epoch metrics
        epoch_loss = running_loss / len(self.val_loader)
        epoch_accuracy = correct_predictions / total_samples
        
        self.val_losses.append(epoch_loss)
        self.val_accuracies.append(epoch_accuracy)
        
        # Calculate detailed metrics
        class_names = ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded']
        detailed_metrics = self.calculate_detailed_metrics(
            all_labels, all_predictions, all_probabilities, class_names
        )
        
        logger.info(f'Epoch {epoch+1} Val - Loss: {epoch_loss:.4f}, Acc: {epoch_accuracy:.4f}')
        
        # Log to TensorBoard
        self.writer.add_scalar('Val/Loss', epoch_loss, epoch)
        self.writer.add_scalar('Val/Accuracy', epoch_accuracy, epoch)
        
        for class_name, metrics in detailed_metrics['per_class'].items():
            self.writer.add_scalar(f'Val/{class_name}_F1', metrics['f1'], epoch)
        
        return epoch_loss, epoch_accuracy, detailed_metrics
    
    def calculate_detailed_metrics(
        self,
        labels: list,
        predictions: list,
        probabilities: list,
        class_names: list
    ) -> Dict:
        """Calculate detailed classification metrics"""
        
        # Classification report
        report = classification_report(
            labels, predictions, 
            target_names=class_names,
            output_dict=True,
            zero_division=0
        )
        
        # Confusion matrix
        cm = confusion_matrix(labels, predictions)
        
        # Per-class metrics
        per_class = {}
        for i, class_name in enumerate(class_names):
            if class_name in report:
                per_class[class_name] = {
                    'precision': report[class_name]['precision'],
                    'recall': report[class_name]['recall'],
                    'f1': report[class_name]['f1-score'],
                    'support': report[class_name]['support']
                }
        
        # Overall metrics
        overall = {
            'accuracy': accuracy_score(labels, predictions),
            'macro_precision': report['macro avg']['precision'],
            'macro_recall': report['macro avg']['recall'],
            'macro_f1': report['macro avg']['f1-score'],
            'weighted_precision': report['weighted avg']['precision'],
            'weighted_recall': report['weighted avg']['recall'],
            'weighted_f1': report['weighted avg']['f1-score']
        }
        
        return {
            'per_class': per_class,
            'overall': overall,
            'confusion_matrix': cm.tolist()
        }
    
    def save_checkpoint(self, epoch: int, metrics: Dict, is_best: bool = False):
        """Save model checkpoint"""
        
        checkpoint = {
            'epoch': epoch,
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'scheduler_state_dict': self.scheduler.state_dict() if self.scheduler else None,
            'best_val_accuracy': self.best_val_accuracy,
            'best_val_loss': self.best_val_loss,
            'metrics': metrics,
            'model_config': {
                'num_classes': getattr(self.model, 'num_classes', 5),
                'use_forensic_features': getattr(self.model, 'use_forensic_features', True)
            }
        }
        
        # Save regular checkpoint
        checkpoint_path = self.checkpoint_dir / f'checkpoint_epoch_{epoch+1}.pth'
        torch.save(checkpoint, checkpoint_path)
        
        # Save best checkpoint
        if is_best:
            best_path = self.checkpoint_dir / 'best_model.pth'
            torch.save(checkpoint, best_path)
            logger.info(f'Saved best model: {best_path}')
        
        # Save latest checkpoint
        latest_path = self.checkpoint_dir / 'latest.pth'
        torch.save(checkpoint, latest_path)
    
    def plot_training_curves(self):
        """Plot training curves"""
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 5))
        
        # Loss curves
        ax1.plot(self.train_losses, label='Train Loss')
        ax1.plot(self.val_losses, label='Val Loss')
        ax1.set_title('Training and Validation Loss')
        ax1.set_xlabel('Epoch')
        ax1.set_ylabel('Loss')
        ax1.legend()
        ax1.grid(True)
        
        # Accuracy curves
        ax2.plot(self.train_accuracies, label='Train Acc')
        ax2.plot(self.val_accuracies, label='Val Acc')
        ax2.set_title('Training and Validation Accuracy')
        ax2.set_xlabel('Epoch')
        ax2.set_ylabel('Accuracy')
        ax2.legend()
        ax2.grid(True)
        
        plt.tight_layout()
        plt.savefig(self.output_dir / 'training_curves.png', dpi=300, bbox_inches='tight')
        plt.close()
    
    def plot_confusion_matrix(self, cm: np.ndarray, class_names: list, epoch: int):
        """Plot confusion matrix"""
        plt.figure(figsize=(10, 8))
        sns.heatmap(
            cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=class_names, yticklabels=class_names
        )
        plt.title(f'Confusion Matrix - Epoch {epoch+1}')
        plt.ylabel('True Label')
        plt.xlabel('Predicted Label')
        plt.tight_layout()
        plt.savefig(self.output_dir / f'confusion_matrix_epoch_{epoch+1}.png', dpi=300, bbox_inches='tight')
        plt.close()
    
    def train(
        self,
        num_epochs: int = 100,
        save_every: int = 10,
        validate_every: int = 1
    ):
        """Main training loop"""
        
        logger.info(f'Starting training for {num_epochs} epochs')
        logger.info(f'Device: {self.device}')
        logger.info(f'Train samples: {len(self.train_loader.dataset)}')
        logger.info(f'Val samples: {len(self.val_loader.dataset)}')
        
        for epoch in range(num_epochs):
            # Training
            train_loss, train_acc = self.train_epoch(epoch)
            
            # Validation
            if epoch % validate_every == 0:
                val_loss, val_acc, val_metrics = self.validate_epoch(epoch)
                
                # Update learning rate
                if self.scheduler:
                    if isinstance(self.scheduler, optim.lr_scheduler.ReduceLROnPlateau):
                        self.scheduler.step(val_loss)
                    else:
                        self.scheduler.step()
                
                # Check for improvement
                is_best = val_acc > self.best_val_accuracy
                if is_best:
                    self.best_val_accuracy = val_acc
                    self.best_val_loss = val_loss
                
                # Save checkpoint
                if epoch % save_every == 0 or is_best:
                    self.save_checkpoint(epoch, val_metrics, is_best)
                
                # Plot confusion matrix for best epoch
                if is_best:
                    self.plot_confusion_matrix(
                        np.array(val_metrics['confusion_matrix']),
                        ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded'],
                        epoch
                    )
                
                # Early stopping
                if self.early_stopping(val_loss, self.model):
                    logger.info(f'Early stopping triggered at epoch {epoch+1}')
                    break
        
        # Final plots
        self.plot_training_curves()
        
        # Save final results
        results = {
            'best_val_accuracy': self.best_val_accuracy,
            'best_val_loss': self.best_val_loss,
            'train_losses': self.train_losses,
            'val_losses': self.val_losses,
            'train_accuracies': self.train_accuracies,
            'val_accuracies': self.val_accuracies,
            'total_epochs': epoch + 1
        }
        
        with open(self.output_dir / 'training_results.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        logger.info(f'Training completed!')
        logger.info(f'Best val accuracy: {self.best_val_accuracy:.4f}')
        logger.info(f'Best val loss: {self.best_val_loss:.4f}')
        
        self.writer.close()
        
        return results


def main():
    """Main training function"""
    parser = argparse.ArgumentParser(description='Train Forensic Image Classifier')
    parser.add_argument('--train-dir', type=str, default='datasets/train', help='Training data directory')
    parser.add_argument('--val-dir', type=str, default='datasets/val', help='Validation data directory')
    parser.add_argument('--output-dir', type=str, default='outputs', help='Output directory')
    parser.add_argument('--experiment-name', type=str, default=f'forensic_{datetime.now().strftime("%Y%m%d_%H%M%S")}', help='Experiment name')
    parser.add_argument('--epochs', type=int, default=100, help='Number of epochs')
    parser.add_argument('--batch-size', type=int, default=32, help='Batch size')
    parser.add_argument('--lr', type=float, default=1e-4, help='Learning rate')
    parser.add_argument('--num-workers', type=int, default=4, help='Number of data loader workers')
    parser.add_argument('--loss', type=str, default='focal', choices=['cross_entropy', 'focal', 'label_smoothing'], help='Loss function')
    parser.add_argument('--scheduler', type=str, default='cosine', choices=['cosine', 'step', 'plateau'], help='LR scheduler')
    
    args = parser.parse_args()
    
    # Create data loaders
    train_loader, val_loader = create_data_loaders(
        args.train_dir,
        args.val_dir,
        batch_size=args.batch_size,
        num_workers=args.num_workers
    )
    
    # Create model
    model, device = create_model(device='cuda' if torch.cuda.is_available() else 'cpu')
    
    # Create trainer
    trainer = ForensicTrainer(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        device=device,
        output_dir=args.output_dir,
        experiment_name=args.experiment_name
    )
    
    # Setup training
    trainer.setup_training(
        learning_rate=args.lr,
        loss_type=args.loss,
        scheduler_type=args.scheduler
    )
    
    # Start training
    results = trainer.train(num_epochs=args.epochs)
    
    print(f"\nTraining completed successfully!")
    print(f"Results saved to: {args.output_dir}")
    print(f"Best validation accuracy: {results['best_val_accuracy']:.4f}")


if __name__ == "__main__":
    main()
