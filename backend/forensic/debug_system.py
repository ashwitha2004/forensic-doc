"""
Advanced Debugging System for Forensic Analysis
Comprehensive logging and analysis debugging tools
"""

import logging
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from dataclasses import dataclass, asdict

# Configure debug logging
debug_logger = logging.getLogger('forensic_debug')
debug_logger.setLevel(logging.DEBUG)

# Create file handler for debug logs
debug_handler = logging.FileHandler('forensic_debug.log')
debug_handler.setLevel(logging.DEBUG)
debug_formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
debug_handler.setFormatter(debug_formatter)
debug_logger.addHandler(debug_handler)

@dataclass
class DebugMetrics:
    """Data class for debug metrics"""
    timestamp: str
    image_id: str
    processing_stage: str
    duration_ms: float
    memory_usage_mb: float
    cpu_usage_percent: float
    gpu_usage_mb: float
    debug_data: Dict[str, Any]

class ForensicDebugger:
    """
    Advanced debugging system for forensic analysis
    """
    
    def __init__(self, output_dir: str = 'outputs/debug'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Debug data storage
        self.debug_history: List[DebugMetrics] = []
        self.current_session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Performance tracking
        self.stage_timings = {}
        self.memory_snapshots = []
        
        debug_logger.info(f"[DEBUG] Initialized Forensic Debugger - Session: {self.current_session_id}")
        debug_logger.info(f"[DEBUG] Output directory: {self.output_dir}")
    
    def start_stage(self, stage_name: str, image_id: str = "unknown") -> str:
        """Start timing a processing stage"""
        stage_id = f"{stage_name}_{image_id}_{time.time()}"
        
        debug_logger.info(f"[DEBUG] Starting stage: {stage_name} (ID: {stage_id})")
        
        # Record start time
        self.stage_timings[stage_id] = {
            'start_time': time.time(),
            'stage_name': stage_name,
            'image_id': image_id
        }
        
        return stage_id
    
    def end_stage(
        self,
        stage_id: str,
        debug_data: Optional[Dict[str, Any]] = None,
        log_level: str = "INFO"
    ) -> float:
        """End timing a processing stage and log results"""
        if stage_id not in self.stage_timings:
            debug_logger.warning(f"[DEBUG] Stage ID not found: {stage_id}")
            return 0.0
        
        stage_info = self.stage_timings[stage_id]
        end_time = time.time()
        duration_ms = (end_time - stage_info['start_time']) * 1000
        
        # Get system metrics
        memory_usage = self.get_memory_usage()
        cpu_usage = self.get_cpu_usage()
        gpu_usage = self.get_gpu_usage()
        
        # Create debug metrics
        metrics = DebugMetrics(
            timestamp=datetime.now().isoformat(),
            image_id=stage_info['image_id'],
            processing_stage=stage_info['stage_name'],
            duration_ms=duration_ms,
            memory_usage_mb=memory_usage,
            cpu_usage_percent=cpu_usage,
            gpu_usage_mb=gpu_usage,
            debug_data=debug_data or {}
        )
        
        # Store metrics
        self.debug_history.append(metrics)
        
        # Log detailed information
        log_message = f"[DEBUG] Completed stage: {stage_info['stage_name']} - {duration_ms:.2f}ms"
        if debug_data:
            log_message += f" - Data: {debug_data}"
        
        if log_level == "INFO":
            debug_logger.info(log_message)
        elif log_level == "WARNING":
            debug_logger.warning(log_message)
        elif log_level == "ERROR":
            debug_logger.error(log_message)
        
        # Log system metrics
        debug_logger.info(f"[DEBUG] System metrics - Memory: {memory_usage:.1f}MB, CPU: {cpu_usage:.1f}%, GPU: {gpu_usage:.1f}MB")
        
        # Clean up
        del self.stage_timings[stage_id]
        
        return duration_ms
    
    def log_cnn_analysis(
        self,
        image_id: str,
        cnn_probabilities: Dict[str, float],
        layer_outputs: Optional[Dict[str, np.ndarray]] = None
    ):
        """Log CNN analysis details"""
        debug_logger.info(f"[DEBUG] CNN Analysis for {image_id}")
        
        # Log probabilities
        for class_name, prob in cnn_probabilities.items():
            debug_logger.info(f"[DEBUG]   CNN {class_name}: {prob*100:.2f}%")
        
        # Log layer outputs if available
        if layer_outputs:
            debug_logger.info(f"[DEBUG] CNN Layer Outputs:")
            for layer_name, output in layer_outputs.items():
                debug_logger.info(f"[DEBUG]   {layer_name}: shape={output.shape}, mean={np.mean(output):.4f}, std={np.std(output):.4f}")
    
    def log_forensic_analysis(
        self,
        image_id: str,
        forensic_features: Dict[str, float],
        forensic_scores: Dict[str, float]
    ):
        """Log forensic analysis details"""
        debug_logger.info(f"[DEBUG] Forensic Analysis for {image_id}")
        
        # Log key forensic features
        key_features = [
            'has_exif', 'prnu_std', 'edge_smoothness', 'jpeg_quality_estimate',
            'blockiness', 'fft_peak_frequency', 'edge_density'
        ]
        
        debug_logger.info(f"[DEBUG] Key Forensic Features:")
        for feature in key_features:
            value = forensic_features.get(feature, 0.0)
            debug_logger.info(f"[DEBUG]   {feature}: {value:.4f}")
        
        # Log forensic scores
        debug_logger.info(f"[DEBUG] Forensic Scores:")
        for class_name, score in forensic_scores.items():
            debug_logger.info(f"[DEBUG]   {class_name}: {score:.2f}")
    
    def log_hybrid_analysis(
        self,
        image_id: str,
        cnn_probs: Dict[str, float],
        forensic_scores: Dict[str, float],
        combined_scores: Dict[str, float],
        final_classification: str,
        confidence: float,
        reasoning: Dict[str, str]
    ):
        """Log hybrid analysis details"""
        debug_logger.info(f"[DEBUG] Hybrid Analysis for {image_id}")
        debug_logger.info(f"[DEBUG] Final Classification: {final_classification} ({confidence:.1f}% confidence)")
        
        # Log score comparison
        debug_logger.info(f"[DEBUG] Score Comparison:")
        for class_name in ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded']:
            cnn_score = cnn_probs.get(class_name, 0.0) * 100
            forensic_score = forensic_scores.get(class_name, 0.0)
            combined_score = combined_scores.get(class_name, 0.0)
            
            debug_logger.info(f"[DEBUG]   {class_name}:")
            debug_logger.info(f"[DEBUG]     CNN: {cnn_score:.2f}%")
            debug_logger.info(f"[DEBUG]     Forensic: {forensic_score:.2f}%")
            debug_logger.info(f"[DEBUG]     Combined: {combined_score:.2f}%")
        
        # Log reasoning
        debug_logger.info(f"[DEBUG] Classification Reasoning:")
        for reason_type, reason_text in reasoning.items():
            debug_logger.info(f"[DEBUG]   {reason_type}: {reason_text}")
    
    def log_threshold_analysis(
        self,
        image_id: str,
        scores: Dict[str, float],
        thresholds: Dict[str, float],
        applied_rules: List[str]
    ):
        """Log threshold analysis"""
        debug_logger.info(f"[DEBUG] Threshold Analysis for {image_id}")
        
        for class_name, threshold in thresholds.items():
            score = scores.get(class_name, 0.0)
            passed = score >= threshold
            status = "PASS" if passed else "FAIL"
            
            debug_logger.info(f"[DEBUG]   {class_name}: {score:.2f} >= {threshold:.2f} = {status}")
        
        debug_logger.info(f"[DEBUG] Applied Rules: {', '.join(applied_rules)}")
    
    def log_performance_metrics(self, session_summary: bool = False):
        """Log performance metrics"""
        if not self.debug_history:
            debug_logger.warning("[DEBUG] No debug history available")
            return
        
        # Calculate metrics
        total_stages = len(self.debug_history)
        avg_duration = np.mean([m.duration_ms for m in self.debug_history])
        max_duration = np.max([m.duration_ms for m in self.debug_history])
        min_duration = np.min([m.duration_ms for m in self.debug_history])
        
        avg_memory = np.mean([m.memory_usage_mb for m in self.debug_history])
        max_memory = np.max([m.memory_usage_mb for m in self.debug_history])
        
        avg_cpu = np.mean([m.cpu_usage_percent for m in self.debug_history])
        max_cpu = np.max([m.cpu_usage_percent for m in self.debug_history])
        
        if session_summary:
            debug_logger.info(f"[DEBUG] Session Summary - {self.current_session_id}")
            debug_logger.info(f"[DEBUG] Total stages: {total_stages}")
            debug_logger.info(f"[DEBUG] Avg duration: {avg_duration:.2f}ms")
            debug_logger.info(f"[DEBUG] Max duration: {max_duration:.2f}ms")
            debug_logger.info(f"[DEBUG] Min duration: {min_duration:.2f}ms")
            debug_logger.info(f"[DEBUG] Avg memory: {avg_memory:.1f}MB")
            debug_logger.info(f"[DEBUG] Max memory: {max_memory:.1f}MB")
            debug_logger.info(f"[DEBUG] Avg CPU: {avg_cpu:.1f}%")
            debug_logger.info(f"[DEBUG] Max CPU: {max_cpu:.1f}%")
        
        return {
            'total_stages': total_stages,
            'avg_duration_ms': avg_duration,
            'max_duration_ms': max_duration,
            'min_duration_ms': min_duration,
            'avg_memory_mb': avg_memory,
            'max_memory_mb': max_memory,
            'avg_cpu_percent': avg_cpu,
            'max_cpu_percent': max_cpu
        }
    
    def save_debug_report(self, output_path: Optional[str] = None):
        """Save comprehensive debug report"""
        if not output_path:
            output_path = self.output_dir / f'debug_report_{self.current_session_id}.json'
        
        # Prepare report data
        report = {
            'session_id': self.current_session_id,
            'timestamp': datetime.now().isoformat(),
            'performance_metrics': self.log_performance_metrics(session_summary=True),
            'debug_history': [asdict(metric) for metric in self.debug_history],
            'summary': {
                'total_debug_entries': len(self.debug_history),
                'stages_analyzed': list(set(m.processing_stage for m in self.debug_history)),
                'images_processed': list(set(m.image_id for m in self.debug_history))
            }
        }
        
        # Save report
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        debug_logger.info(f"[DEBUG] Debug report saved: {output_path}")
        
        return output_path
    
    def create_performance_plots(self):
        """Create performance visualization plots"""
        if not self.debug_history:
            debug_logger.warning("[DEBUG] No data for performance plots")
            return
        
        # Extract data
        durations = [m.duration_ms for m in self.debug_history]
        memory_usage = [m.memory_usage_mb for m in self.debug_history]
        cpu_usage = [m.cpu_usage_percent for m in self.debug_history]
        stages = [m.processing_stage for m in self.debug_history]
        
        # Create plots
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 10))
        
        # Duration plot
        stage_duration = {}
        for stage, duration in zip(stages, durations):
            if stage not in stage_duration:
                stage_duration[stage] = []
            stage_duration[stage].append(duration)
        
        ax1.boxplot([stage_duration[stage] for stage in stage_duration.keys()], 
                     labels=list(stage_duration.keys()))
        ax1.set_title('Processing Time by Stage')
        ax1.set_ylabel('Duration (ms)')
        ax1.tick_params(axis='x', rotation=45)
        
        # Memory usage plot
        ax2.plot(range(len(memory_usage)), memory_usage)
        ax2.set_title('Memory Usage Over Time')
        ax2.set_xlabel('Stage Number')
        ax2.set_ylabel('Memory Usage (MB)')
        ax2.grid(True)
        
        # CPU usage plot
        ax3.plot(range(len(cpu_usage)), cpu_usage, color='orange')
        ax3.set_title('CPU Usage Over Time')
        ax3.set_xlabel('Stage Number')
        ax3.set_ylabel('CPU Usage (%)')
        ax3.grid(True)
        
        # Stage frequency plot
        stage_counts = {}
        for stage in stages:
            stage_counts[stage] = stage_counts.get(stage, 0) + 1
        
        ax4.bar(stage_counts.keys(), stage_counts.values())
        ax4.set_title('Stage Execution Frequency')
        ax4.set_xlabel('Stage Name')
        ax4.set_ylabel('Count')
        ax4.tick_params(axis='x', rotation=45)
        
        plt.tight_layout()
        plot_path = self.output_dir / f'performance_plots_{self.current_session_id}.png'
        plt.savefig(plot_path, dpi=300, bbox_inches='tight')
        plt.close()
        
        debug_logger.info(f"[DEBUG] Performance plots saved: {plot_path}")
        return plot_path
    
    def get_memory_usage(self) -> float:
        """Get current memory usage in MB"""
        try:
            import psutil
            process = psutil.Process()
            memory_info = process.memory_info()
            return memory_info.rss / 1024 / 1024  # Convert to MB
        except ImportError:
            debug_logger.warning("[DEBUG] psutil not available for memory monitoring")
            return 0.0
        except Exception as e:
            debug_logger.warning(f"[DEBUG] Memory monitoring failed: {e}")
            return 0.0
    
    def get_cpu_usage(self) -> float:
        """Get current CPU usage percentage"""
        try:
            import psutil
            return psutil.cpu_percent(interval=None)
        except ImportError:
            debug_logger.warning("[DEBUG] psutil not available for CPU monitoring")
            return 0.0
        except Exception as e:
            debug_logger.warning(f"[DEBUG] CPU monitoring failed: {e}")
            return 0.0
    
    def get_gpu_usage(self) -> float:
        """Get current GPU usage in MB"""
        try:
            if torch.cuda.is_available():
                return torch.cuda.memory_allocated() / 1024 / 1024  # Convert to MB
            else:
                return 0.0
        except Exception as e:
            debug_logger.warning(f"[DEBUG] GPU monitoring failed: {e}")
            return 0.0
    
    def reset_session(self):
        """Reset debug session"""
        self.debug_history.clear()
        self.stage_timings.clear()
        self.memory_snapshots.clear()
        self.current_session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        debug_logger.info(f"[DEBUG] Session reset - New session: {self.current_session_id}")
    
    def create_error_report(self, error: Exception, context: Dict[str, Any]) -> str:
        """Create detailed error report"""
        error_report = {
            'timestamp': datetime.now().isoformat(),
            'session_id': self.current_session_id,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'context': context,
            'stack_trace': str(error.__traceback__) if error.__traceback__ else None,
            'system_state': {
                'memory_usage_mb': self.get_memory_usage(),
                'cpu_usage_percent': self.get_cpu_usage(),
                'gpu_usage_mb': self.get_gpu_usage()
            }
        }
        
        # Save error report
        error_path = self.output_dir / f'error_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        with open(error_path, 'w') as f:
            json.dump(error_report, f, indent=2)
        
        debug_logger.error(f"[DEBUG] Error report saved: {error_path}")
        debug_logger.error(f"[DEBUG] Error details: {error_report}")
        
        return str(error_path)


# Global debug instance
debug_instance = None

def get_debug_instance() -> ForensicDebugger:
    """Get or create global debug instance"""
    global debug_instance
    if debug_instance is None:
        debug_instance = ForensicDebugger()
    return debug_instance

def debug_log_cnn(image_id: str, cnn_probabilities: Dict[str, float], **kwargs):
    """Convenience function for CNN debugging"""
    debugger = get_debug_instance()
    debugger.log_cnn_analysis(image_id, cnn_probabilities, **kwargs)

def debug_log_forensic(image_id: str, forensic_features: Dict[str, float], **kwargs):
    """Convenience function for forensic debugging"""
    debugger = get_debug_instance()
    debugger.log_forensic_analysis(image_id, forensic_features, **kwargs)

def debug_log_hybrid(image_id: str, **kwargs):
    """Convenience function for hybrid debugging"""
    debugger = get_debug_instance()
    debugger.log_hybrid_analysis(image_id, **kwargs)

def debug_start_stage(stage_name: str, image_id: str = "unknown") -> str:
    """Convenience function for stage timing"""
    debugger = get_debug_instance()
    return debugger.start_stage(stage_name, image_id)

def debug_end_stage(stage_id: str, **kwargs):
    """Convenience function for stage completion"""
    debugger = get_debug_instance()
    return debugger.end_stage(stage_id, **kwargs)

def debug_save_report():
    """Convenience function for saving debug report"""
    debugger = get_debug_instance()
    return debugger.save_debug_report()

def debug_create_plots():
    """Convenience function for creating performance plots"""
    debugger = get_debug_instance()
    return debugger.create_performance_plots()

# Test the debugging system
if __name__ == "__main__":
    debugger = ForensicDebugger()
    
    # Test stage timing
    stage_id = debugger.start_stage("test_stage", "test_image")
    time.sleep(0.1)  # Simulate work
    duration = debugger.end_stage(stage_id, {"test_data": "sample"})
    
    # Test CNN logging
    cnn_probs = {
        'camera': 0.7,
        'ai': 0.1,
        'screenshot': 0.05,
        'whatsapp': 0.1,
        'downloaded': 0.05
    }
    debugger.log_cnn_analysis("test_image", cnn_probs)
    
    # Test forensic logging
    forensic_features = {
        'has_exif': 1.0,
        'prnu_std': 0.8,
        'edge_smoothness': 0.7,
        'jpeg_quality_estimate': 85
    }
    forensic_scores = {
        'camera': 75.0,
        'ai': 15.0,
        'screenshot': 10.0,
        'whatsapp': 20.0,
        'downloaded': 5.0
    }
    debugger.log_forensic_analysis("test_image", forensic_features, forensic_scores)
    
    # Test hybrid logging
    combined_scores = {
        'camera': 72.0,
        'ai': 18.0,
        'screenshot': 12.0,
        'whatsapp': 22.0,
        'downloaded': 8.0
    }
    reasoning = {
        'cnn_reasoning': 'CNN predicts camera with 70% confidence',
        'forensic_reasoning': 'Forensic analysis indicates camera with 75% score',
        'final_reasoning': 'Final classification: camera (Combined score: 72%)'
    }
    
    debugger.log_hybrid_analysis(
        "test_image", cnn_probs, forensic_scores, 
        combined_scores, "camera", 72.0, reasoning
    )
    
    # Save debug report
    debugger.save_debug_report()
    debugger.create_performance_plots()
    
    print("Debug system test completed!")
    print(f"Debug report saved to: {debugger.output_dir}")
