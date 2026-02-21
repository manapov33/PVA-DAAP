/**
 * Blockchain Sync Service - Enhanced Position Management
 * Handles synchronization of position data with the smart contract
 */

import { ethers } from 'ethers';
import { Position, League, BlockchainSyncService as IBlockchainSyncService } from '../types/position';
import { validatePositionData } from '../utils/positionValidation';
import PVAAuctionABI from '../abi/PVAAuction.json';

// League mapping based on contract league values
const LEAGUE_MAP: Record<number, League> = {
  0: { name: 'Silver', min: 0, max: 999, profit: 10 },
  1: { name: 'Gold', min: 1000, max: 9999, profit: 15 },
  2: { name: 'Diamond', min: 10000, max: Infinity, profit: 20 }
};

export class BlockchainSyncService implements IBlockchainSyncService {
  private contract: ethers.Contract | null = null;
  private provider: ethers.Provider | null = null;
  private eventListeners: Map<string, ethers.Listener> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncData: Map<string, Position[]> = new Map();

  constructor(
    private contractAddress: string,
    provider?: ethers.Provider
  ) {
    this.provider = provider || null;
    if (this.provider && this.contractAddress) {
      this.initializeContract();
    }
  }

  private initializeContract(): void {
    if (!this.provider || !this.contractAddress) {
      throw new Error('Provider and contract address are required');
    }
    
    this.contract = new ethers.Contract(
      this.contractAddress,
      PVAAuctionABI,
      this.provider
    );
  }

  /**
   * Synchronizes all positions for a specific user from the smart contract
   * Requirements: 1.1, 1.5
   */
  async syncUserPositions(userAddress: string): Promise<Position[]> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      // Get total number of positions
      const positionsLength = await this.contract.getPositionsLength();
      const userPositions: Position[] = [];

      // Iterate through all positions and filter by user
      for (let i = 0; i < positionsLength; i++) {
        try {
          const contractPosition = await this.contract.getPosition(i);
          
          // Check if position belongs to the user
          if (contractPosition.owner.toLowerCase() === userAddress.toLowerCase()) {
            const position = this.convertContractPositionToPosition(contractPosition, i);
            
            // Validate position data before adding
            if (this.validatePositionData(position)) {
              userPositions.push(position);
            } else {
              console.warn(`Invalid position data for position ${i}:`, position);
            }
          }
        } catch (error) {
          console.error(`Error fetching position ${i}:`, error);
          // Continue with next position instead of failing completely
        }
      }

      return userPositions;
    } catch (error) {
      console.error('Error syncing user positions:', error);
      throw new Error(`Failed to sync positions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets a specific position from the contract by ID
   * Requirements: 1.1, 1.5
   */
  async getPositionFromContract(positionId: number): Promise<Position> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    try {
      const contractPosition = await this.contract.getPosition(positionId);
      const position = this.convertContractPositionToPosition(contractPosition, positionId);
      
      if (!this.validatePositionData(position)) {
        throw new Error(`Invalid position data for position ${positionId}`);
      }

      return position;
    } catch (error) {
      console.error(`Error fetching position ${positionId}:`, error);
      throw new Error(`Failed to get position: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Subscribes to position-related events from the contract
   * Requirements: 1.2, 1.3, 5.4
   */
  subscribeToPositionEvents(userAddress: string, callback: (position: Position) => void): void {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    // Subscribe to Buy events (position creation)
    // Event signature: Buy(address indexed user, uint256 indexed positionId, uint256 usdtAmount, uint256 amountTokens, uint8 partId, League league)
    const buyEventFilter = this.contract.filters.Buy(userAddress);
    const buyListener = async (user: string, positionId: bigint, usdtAmount: bigint, amountTokens: bigint, partId: number, league: number, event: ethers.Log) => {
      try {
        console.log('Buy event detected:', { 
          user, 
          positionId: positionId.toString(), 
          usdtAmount: usdtAmount.toString(), 
          amountTokens: amountTokens.toString(),
          partId,
          league
        });
        
        // Fetch the complete position data from contract
        const position = await this.getPositionFromContract(Number(positionId));
        callback(position);
      } catch (error) {
        console.error('Error handling Buy event:', error);
      }
    };

    // Subscribe to Sell events (position closure)
    // Event signature: Sell(address indexed user, uint256 indexed positionId, uint256 usdtNet, uint256 fee)
    const sellEventFilter = this.contract.filters.Sell(userAddress);
    const sellListener = async (user: string, positionId: bigint, usdtNet: bigint, fee: bigint, event: ethers.Log) => {
      try {
        console.log('Sell event detected:', { 
          user, 
          positionId: positionId.toString(), 
          usdtNet: usdtNet.toString(), 
          fee: fee.toString() 
        });
        
        // Fetch the updated position data (should be marked as closed)
        const position = await this.getPositionFromContract(Number(positionId));
        callback(position);
      } catch (error) {
        console.error('Error handling Sell event:', error);
      }
    };

    // Add event listeners
    this.contract.on(buyEventFilter, buyListener);
    this.contract.on(sellEventFilter, sellListener);

    // Store listeners for cleanup
    this.eventListeners.set(`buy_${userAddress}`, buyListener);
    this.eventListeners.set(`sell_${userAddress}`, sellListener);

    console.log(`Subscribed to position events for user: ${userAddress}`);
  }

  /**
   * Unsubscribes from all contract events
   */
  unsubscribeFromEvents(): void {
    if (!this.contract) {
      return;
    }

    // Remove all event listeners
    this.eventListeners.forEach((listener, key) => {
      this.contract?.off('*', listener);
    });
    
    this.eventListeners.clear();
  }

  /**
   * Starts periodic synchronization for a user
   * Requirements: 1.4, 1.5
   */
  startPeriodicSync(userAddress: string, callback: (positions: Position[]) => void): void {
    // Stop any existing sync
    this.stopPeriodicSync();

    // Start new sync interval (30 seconds)
    this.syncInterval = setInterval(async () => {
      try {
        console.log(`Performing periodic sync for user: ${userAddress}`);
        
        // Get current positions from blockchain
        const currentPositions = await this.syncUserPositions(userAddress);
        
        // Compare with last sync data
        const lastPositions = this.lastSyncData.get(userAddress) || [];
        const hasChanges = this.comparePositions(lastPositions, currentPositions);
        
        if (hasChanges) {
          console.log('Position changes detected, updating local data');
          this.lastSyncData.set(userAddress, currentPositions);
          callback(currentPositions);
        } else {
          console.log('No position changes detected');
        }
      } catch (error) {
        console.error('Error during periodic sync:', error);
      }
    }, 30000); // 30 seconds

    console.log(`Started periodic sync for user: ${userAddress}`);
  }

  /**
   * Stops periodic synchronization
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Stopped periodic sync');
    }
  }

  /**
   * Compares two position arrays to detect changes
   * Requirements: 1.4, 1.5
   */
  private comparePositions(oldPositions: Position[], newPositions: Position[]): boolean {
    // Quick check: different lengths means changes
    if (oldPositions.length !== newPositions.length) {
      return true;
    }

    // Create maps for efficient comparison
    const oldMap = new Map(oldPositions.map(p => [p.id, p]));
    const newMap = new Map(newPositions.map(p => [p.id, p]));

    // Check if any position has changed
    for (const [id, newPos] of newMap) {
      const oldPos = oldMap.get(id);
      
      if (!oldPos) {
        // New position added
        return true;
      }

      // Check key fields for changes
      if (
        oldPos.closed !== newPos.closed ||
        oldPos.amountTokens !== newPos.amountTokens ||
        oldPos.status !== newPos.status ||
        oldPos.unlockAt !== newPos.unlockAt
      ) {
        return true;
      }
    }

    // Check if any position was removed
    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Forces a sync and updates the last sync data
   * Requirements: 1.4, 1.5
   */
  async forceSyncAndUpdate(userAddress: string): Promise<Position[]> {
    const positions = await this.syncUserPositions(userAddress);
    this.lastSyncData.set(userAddress, positions);
    return positions;
  }

  /**
   * Validates position data structure and content
   * Requirements: 6.1, 6.4, 6.5
   */
  validatePositionData(position: any): boolean {
    return validatePositionData(position);
  }

  /**
   * Converts contract position struct to our Position interface
   */
  private convertContractPositionToPosition(contractPosition: any, positionId: number): Position {
    const league = LEAGUE_MAP[contractPosition.league] || LEAGUE_MAP[0];
    
    return {
      id: positionId,
      onChainId: positionId,
      owner: contractPosition.owner,
      amountTokens: BigInt(contractPosition.amountTokens.toString()),
      buyPrice: BigInt(contractPosition.buyPrice.toString()),
      createdAt: Number(contractPosition.createdAt),
      unlockAt: Number(contractPosition.unlockAt),
      partId: Number(contractPosition.partId),
      league,
      closed: contractPosition.closed,
      status: this.determinePositionStatus(contractPosition)
    };
  }

  /**
   * Determines position status based on contract data
   */
  private determinePositionStatus(contractPosition: any): 'active' | 'locked' | 'ready' | 'closed' {
    if (contractPosition.closed) {
      return 'closed';
    }
    
    const now = Math.floor(Date.now() / 1000);
    const unlockTime = Number(contractPosition.unlockAt);
    
    if (now < unlockTime) {
      return 'locked';
    } else {
      return 'ready';
    }
  }

  /**
   * Updates the provider and reinitializes the contract
   */
  updateProvider(provider: ethers.Provider): void {
    this.provider = provider;
    this.initializeContract();
  }

  /**
   * Gets the current contract instance
   */
  getContract(): ethers.Contract | null {
    return this.contract;
  }

  /**
   * Cleanup method to stop all sync operations
   */
  cleanup(): void {
    this.stopPeriodicSync();
    this.unsubscribeFromEvents();
    this.lastSyncData.clear();
  }
}