/**
 * Tests for VirtualizedPositionList Component - Enhanced Position Management
 * Tests virtualization functionality for large position lists
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { fc } from '@fast-check/vitest';
import { VirtualizedPositionList } from './VirtualizedPositionList';
import { Position } from '../types/position';
import { positionArb } from '../test/generators';

// Mock react-window
vi.mock('react-window', () => ({
  FixedSizeList: ({ children, itemData, itemCount, itemSize }: any) => {
    // Render first few items for testing
    const itemsToRender = Math.min(itemCount, 5);
    return (
      <div data-testid="virtualized-list" style={{ height: itemSize * itemsToRender }}>
        {Array.from({ length: itemsToRender }, (_, index) => 
          children({ 
            index, 
            style: { height: itemSize }, 
            data: itemData 
          })
        )}
      </div>
    );
  }
}));

describe('VirtualizedPositionList', () => {
  const defaultProps = {
    positions: [],
    itemHeight: 120,
    height: 600,
    width: '100%'
  };

  describe('Property 15: Virtualization for Large Lists', () => {
    it('should render virtualized list for large datasets', () => {
      fc.assert(
        fc.property(
          fc.array(positionArb, { minLength: 100, maxLength: 500 }),
          (positions) => {
            const { container } = render(
              <VirtualizedPositionList
                {...defaultProps}
                positions={positions}
              />
            );

            // Should render virtualized list container
            const virtualizedList = screen.getByTestId('virtualized-list');
            expect(virtualizedList).toBeInTheDocument();

            // Should not render all items at once (virtualization working)
            const renderedItems = container.querySelectorAll('.position-item-wrapper');
            expect(renderedItems.length).toBeLessThanOrEqual(5); // Only renders visible items
            expect(renderedItems.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle empty position list', () => {
      render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={[]}
        />
      );

      expect(screen.getByText('No positions found')).toBeInTheDocument();
      expect(screen.queryByTestId('virtualized-list')).not.toBeInTheDocument();
    });

    it('should render positions with correct data', () => {
      fc.assert(
        fc.property(
          fc.array(positionArb, { minLength: 1, maxLength: 10 }),
          (positions) => {
            render(
              <VirtualizedPositionList
                {...defaultProps}
                positions={positions}
              />
            );

            // Should render first position data
            const firstPosition = positions[0];
            expect(screen.getByText(`Position #${firstPosition.id}`)).toBeInTheDocument();
            expect(screen.getByText(firstPosition.status.toUpperCase())).toBeInTheDocument();
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should handle position click events', () => {
      const mockOnClick = vi.fn();
      const position = fc.sample(positionArb, 1)[0];
      const positions = [{ ...position, id: 1 }];

      render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={positions}
          onPositionClick={mockOnClick}
        />
      );

      const positionItem = screen.getByText('Position #1').closest('.position-item');
      expect(positionItem).toBeInTheDocument();

      fireEvent.click(positionItem!);
      expect(mockOnClick).toHaveBeenCalledWith(positions[0]);
    });

    it('should handle sell button clicks for ready positions', () => {
      const mockOnSell = vi.fn();
      const basePosition = fc.sample(positionArb, 1)[0];
      const readyPosition = { 
        ...basePosition,
        id: 1, 
        status: 'ready' as const,
        closed: false 
      };

      render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={[readyPosition]}
          onPositionSell={mockOnSell}
        />
      );

      const sellButton = screen.getByText('Sell');
      expect(sellButton).toBeInTheDocument();

      fireEvent.click(sellButton);
      expect(mockOnSell).toHaveBeenCalledWith(readyPosition.id);
    });

    it('should not show sell button for non-ready positions', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('active', 'locked', 'closed'),
          (status) => {
            const basePosition = fc.sample(positionArb, 1)[0];
            const position = { 
              ...basePosition,
              id: 1, 
              status: status as any,
              closed: status === 'closed' 
            };

            render(
              <VirtualizedPositionList
                {...defaultProps}
                positions={[position]}
                onPositionSell={vi.fn()}
              />
            );

            expect(screen.queryByText('Sell')).not.toBeInTheDocument();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should use custom render function when provided', () => {
      const basePosition = fc.sample(positionArb, 1)[0];
      const positions = [{ ...basePosition, id: 1 }];
      const customRender = vi.fn((position: Position) => (
        <div data-testid="custom-position">Custom: {position.id}</div>
      ));

      render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={positions}
          renderPosition={customRender}
        />
      );

      expect(screen.getByTestId('custom-position')).toBeInTheDocument();
      expect(screen.getByText('Custom: 1')).toBeInTheDocument();
      expect(customRender).toHaveBeenCalledWith(positions[0], 0);
    });

    it('should format position data correctly', () => {
      const basePosition = fc.sample(positionArb, 1)[0];
      const position = {
        ...basePosition,
        id: 123,
        amountTokens: BigInt('1500000000000000000'), // 1.5 tokens
        buyPrice: BigInt('2500000000000000'), // 0.0025 ETH
        league: { name: 'Gold' as const, min: 100, max: 500, profit: 15 },
        partId: 42
      };

      render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={[position]}
        />
      );

      expect(screen.getByText('Position #123')).toBeInTheDocument();
      expect(screen.getByText('1.5000 tokens')).toBeInTheDocument();
      expect(screen.getByText('0.002500 ETH')).toBeInTheDocument();
      expect(screen.getByText('Gold')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should display unlock date when available', () => {
      const unlockTimestamp = Math.floor(Date.now() / 1000) + 86400; // Tomorrow
      const basePosition = fc.sample(positionArb, 1)[0];
      const position = {
        ...basePosition,
        id: 1,
        unlockAt: unlockTimestamp
      };

      render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={[position]}
        />
      );

      const unlockDate = new Date(unlockTimestamp * 1000).toLocaleDateString();
      expect(screen.getByText(`Unlocks: ${unlockDate}`)).toBeInTheDocument();
    });

    it('should apply correct status colors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('active', 'locked', 'ready', 'closed'),
          (status) => {
            const basePosition = fc.sample(positionArb, 1)[0];
            const position = { 
              ...basePosition,
              id: 1, 
              status: status as any 
            };

            const { container } = render(
              <VirtualizedPositionList
                {...defaultProps}
                positions={[position]}
              />
            );

            const statusElement = screen.getByText(status.toUpperCase());
            expect(statusElement).toBeInTheDocument();

            // Check that status has appropriate color class
            const expectedColorClasses = {
              active: 'text-green-600',
              locked: 'text-yellow-600', 
              ready: 'text-blue-600',
              closed: 'text-gray-600'
            };

            expect(statusElement).toHaveClass(expectedColorClasses[status as keyof typeof expectedColorClasses]);
          }
        ),
        { numRuns: 4 }
      );
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large datasets efficiently', () => {
      // Generate large dataset
      const largePositionList = Array.from({ length: 1000 }, (_, i) => {
        const position = fc.sample(positionArb, 1)[0];
        return { ...position, id: i + 1 };
      });

      const startTime = performance.now();
      
      const { container } = render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={largePositionList}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render quickly even with large dataset
      expect(renderTime).toBeLessThan(100); // Less than 100ms

      // Should only render visible items, not all 1000
      const renderedItems = container.querySelectorAll('.position-item-wrapper');
      expect(renderedItems.length).toBeLessThanOrEqual(10);
    });

    it('should maintain consistent item height', () => {
      const positions = Array.from({ length: 5 }, (_, i) => {
        const position = fc.sample(positionArb, 1)[0];
        return { ...position, id: i + 1 };
      });

      const { container } = render(
        <VirtualizedPositionList
          {...defaultProps}
          positions={positions}
          itemHeight={150}
        />
      );

      const virtualizedList = screen.getByTestId('virtualized-list');
      expect(virtualizedList).toHaveStyle({ height: '750px' }); // 5 items * 150px
    });
  });
});

/**
 * Feature: enhanced-position-management, Property 15: Virtualization for Large Lists
 * For any position list with more than 100 items, virtualization should be used for rendering optimization
 * Validates: Requirements 5.2
 */