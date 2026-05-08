import React from 'react';

interface StatusIndicatorProps {
  status: 'active' | 'inactive' | 'connecting';
}

const StatusIndicator = ({ status }: StatusIndicatorProps) => {
  const getStatusColor = () => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'inactive':
        return 'bg-red-500';
      case 'connecting':
        return 'bg-yellow-500 animate-pulse';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
      <span className="text-xs text-white font-medium capitalize">
        {status === 'active' ? 'Connected' : status === 'inactive' ? 'Disconnected' : 'Connecting'}
      </span>
    </div>
  );
};

export { StatusIndicator };
