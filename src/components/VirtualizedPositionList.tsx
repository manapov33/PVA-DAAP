/**
 * Virtualized Position List Component - Enhanced Position Management
 * Implements virtualization for large position lists (100+ items)
 */

import React, { useMemo, useCallback } from 'react';
import { Position } from '../types/position';

export interface VirtualizedPositionListProps {
  positions: Position[];
  itemHeight: number;
  height: number;
  width?: number | string;
  onPositionClick?: (position: Position) => void;
  onPositionSell?: (positionId: number) => void;
  renderPosition?: (position: Position, index: number) => React.ReactNode;
  className?: string;
  overscanCount?: number;
}

interface PositionItemProps {
  position: Position;
  index: number;
  style: React.CSSProperties;
  onPositionClick?: (position: Position) => void;
  onPositionSell?: (positionId: number) => void;
  renderPosition?: (position: Position, index: number) => React.ReactNode;
}

const PositionItem: React.FC<PositionItemProps> = ({ 
  position, 
  index, 
  style, 
  onPositionClick, 
  onPositionSell, 
  renderPosition 
}) => {
  const handleClick = useCallback(() => {
    if (onPositionClick) {
      onPositionClick(position);
    }
  }, [position, onPositionClick]);

  const handleSell = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPositionSell) {
      onPositionSell(position.id);
    }
  }, [position.id, onPositionSell]);

  return (
    <div style={style} className="position-item-wrapper">
      {renderPosition ? (
        renderPosition(position, index)
      ) : (
        <DefaultPositionItem
          position={position}
          onClick={handleClick}
          onSell={handleSell}
        />
      )}
    </div>
  );
};

interface DefaultPositionItemProps {
  position: Position;
  onClick: () => void;
  onSell: (e: React.MouseEvent) => void;
}

const DefaultPositionItem: React.FC<DefaultPositionItemProps> = ({
  position,
  onClick,
  onSell
}) => {
  const formatAmount = (amount: bigint): string => {
    return (Number(amount) / 1e18).toFixed(4);
  };

  const formatPrice = (price: bigint): string => {
    return (Number(price) / 1e18).toFixed(6);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'locked': return 'text-yellow-600';
      case 'ready': return 'text-blue-600';
      case 'closed': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div
      className="position-item border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold">Position #{position.id}</span>
            <span className={`text-sm font-medium ${getStatusColor(position.status)}`}>
              {position.status.toUpperCase()}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Amount:</span>
              <span className="ml-2 font-medium">{formatAmount(position.amountTokens)} tokens</span>
            </div>
            <div>
              <span className="text-gray-600">Buy Price:</span>
              <span className="ml-2 font-medium">{formatPrice(position.buyPrice)} ETH</span>
            </div>
            <div>
              <span className="text-gray-600">League:</span>
              <span className="ml-2 font-medium">{position.league.name}</span>
            </div>
            <div>
              <span className="text-gray-600">Part ID:</span>
              <span className="ml-2 font-medium">{position.partId}</span>
            </div>
          </div>

          {position.unlockAt && (
            <div className="mt-2 text-sm text-gray-600">
              Unlocks: {new Date(position.unlockAt * 1000).toLocaleDateString()}
            </div>
          )}
        </div>

        {position.status === 'ready' && !position.closed && (
          <button
            onClick={onSell}
            className="ml-4 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
          >
            Sell
          </button>
        )}
      </div>
    </div>
  );
};

// Simple virtualization implementation for large lists
export const VirtualizedPositionList: React.FC<VirtualizedPositionListProps> = ({
  positions,
  itemHeight,
  height,
  width = '100%',
  onPositionClick,
  onPositionSell,
  renderPosition,
  className = '',
  overscanCount = 5
}) => {
  const [scrollTop, setScrollTop] = React.useState(0);

  const visibleRange = useMemo(() => {
    const containerHeight = height;
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + overscanCount,
      positions.length
    );
    
    return {
      startIndex: Math.max(0, startIndex - overscanCount),
      endIndex
    };
  }, [scrollTop, itemHeight, height, positions.length, overscanCount]);

  const visibleItems = useMemo(() => {
    return positions.slice(visibleRange.startIndex, visibleRange.endIndex);
  }, [positions, visibleRange]);

  const totalHeight = positions.length * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  if (positions.length === 0) {
    return (
      <div className={`empty-positions ${className}`} style={{ height }}>
        <div className="flex items-center justify-center h-full text-gray-500">
          No positions found
        </div>
      </div>
    );
  }

  return (
    <div className={`virtualized-position-list ${className}`}>
      <div
        style={{
          height,
          width,
          overflow: 'auto'
        }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleItems.map((position, index) => {
            const actualIndex = visibleRange.startIndex + index;
            return (
              <PositionItem
                key={`${position.id}-${actualIndex}`}
                position={position}
                index={actualIndex}
                style={{
                  position: 'absolute',
                  top: actualIndex * itemHeight,
                  left: 0,
                  right: 0,
                  height: itemHeight
                }}
                onPositionClick={onPositionClick}
                onPositionSell={onPositionSell}
                renderPosition={renderPosition}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VirtualizedPositionList;