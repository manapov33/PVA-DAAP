/**
 * Position Data Validation Utilities
 * Implements validation functions for position data integrity
 */

import { Position, League } from '../types/position';

/**
 * Validates the structure and content of position data
 * Requirements: 6.1, 6.4, 6.5
 */
export function validatePositionData(position: any): position is Position {
  try {
    // Check if position is an object
    if (!position || typeof position !== 'object') {
      console.error('Position validation failed: position is not an object', position);
      return false;
    }

    // Validate required fields exist
    const requiredFields = ['id', 'owner', 'amountTokens', 'buyPrice', 'createdAt', 'unlockAt', 'partId', 'league', 'closed', 'status'];
    for (const field of requiredFields) {
      if (!(field in position)) {
        console.error(`Position validation failed: missing required field '${field}'`, position);
        return false;
      }
    }

    // Validate field types and values
    if (typeof position.id !== 'number' || position.id < 0) {
      console.error('Position validation failed: id must be a non-negative number', position.id);
      return false;
    }

    if (typeof position.owner !== 'string' || !isValidEthereumAddress(position.owner)) {
      console.error('Position validation failed: owner must be a valid Ethereum address', position.owner);
      return false;
    }

    if (typeof position.amountTokens !== 'bigint' || position.amountTokens <= 0n) {
      console.error('Position validation failed: amountTokens must be a positive bigint', position.amountTokens);
      return false;
    }

    if (typeof position.buyPrice !== 'bigint' || position.buyPrice <= 0n) {
      console.error('Position validation failed: buyPrice must be a positive bigint', position.buyPrice);
      return false;
    }

    // Validate timestamps (Requirements 6.4)
    if (!validateTimestamp(position.createdAt)) {
      console.error('Position validation failed: createdAt must be a valid timestamp', position.createdAt);
      return false;
    }

    if (!validateTimestamp(position.unlockAt)) {
      console.error('Position validation failed: unlockAt must be a valid timestamp', position.unlockAt);
      return false;
    }

    // Validate unlockAt is after createdAt
    if (position.unlockAt <= position.createdAt) {
      console.error('Position validation failed: unlockAt must be after createdAt', {
        createdAt: position.createdAt,
        unlockAt: position.unlockAt
      });
      return false;
    }

    if (typeof position.partId !== 'number' || position.partId < 1) {
      console.error('Position validation failed: partId must be a positive number', position.partId);
      return false;
    }

    if (!validateLeague(position.league)) {
      console.error('Position validation failed: invalid league data', position.league);
      return false;
    }

    if (typeof position.closed !== 'boolean') {
      console.error('Position validation failed: closed must be a boolean', position.closed);
      return false;
    }

    // Validate status
    const validStatuses = ['active', 'locked', 'ready', 'closed'];
    if (!validStatuses.includes(position.status)) {
      console.error('Position validation failed: invalid status', position.status);
      return false;
    }

    // Validate optional fields if present
    if (position.onChainId != null && (typeof position.onChainId !== 'number' || position.onChainId < 0)) {
      console.error('Position validation failed: onChainId must be a non-negative number if present', position.onChainId);
      return false;
    }

    if (position.transactionHash != null && (typeof position.transactionHash !== 'string' || !isValidTransactionHash(position.transactionHash))) {
      console.error('Position validation failed: transactionHash must be a valid hash if present', position.transactionHash);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Position validation failed with exception:', error);
    return false;
  }
}

/**
 * Validates that the position owner matches the current user
 * Requirements: 6.3
 */
export function validateOwnership(position: Position, currentUserAddress: string): boolean {
  try {
    if (!currentUserAddress || typeof currentUserAddress !== 'string') {
      console.error('Ownership validation failed: invalid current user address', currentUserAddress);
      return false;
    }

    if (!isValidEthereumAddress(currentUserAddress)) {
      console.error('Ownership validation failed: current user address is not a valid Ethereum address', currentUserAddress);
      return false;
    }

    // Ethereum addresses are case-insensitive, so normalize to lowercase for comparison
    const normalizedOwner = position.owner.toLowerCase();
    const normalizedUser = currentUserAddress.toLowerCase();

    if (normalizedOwner !== normalizedUser) {
      console.error('Ownership validation failed: position owner does not match current user', {
        positionOwner: position.owner,
        currentUser: currentUserAddress
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Ownership validation failed with exception:', error);
    return false;
  }
}

/**
 * Validates timestamp values
 * Requirements: 6.4
 */
function validateTimestamp(timestamp: any): boolean {
  if (typeof timestamp !== 'number') {
    return false;
  }

  // Check if timestamp is a reasonable Unix timestamp (in milliseconds)
  // Should be between year 2020 and year 2050
  const minTimestamp = new Date('2020-01-01').getTime();
  const maxTimestamp = new Date('2050-01-01').getTime();

  return timestamp >= minTimestamp && timestamp <= maxTimestamp;
}

/**
 * Validates league data structure
 */
function validateLeague(league: any): league is League {
  if (!league || typeof league !== 'object') {
    return false;
  }

  const validLeagueNames = ['Silver', 'Gold', 'Diamond'];
  if (!validLeagueNames.includes(league.name)) {
    return false;
  }

  if (typeof league.min !== 'number' || league.min < 0) {
    return false;
  }

  if (typeof league.max !== 'number' || league.max <= league.min) {
    return false;
  }

  if (typeof league.profit !== 'number' || league.profit < 0 || league.profit > 1) {
    return false;
  }

  return true;
}

/**
 * Validates Ethereum address format
 */
function isValidEthereumAddress(address: string): boolean {
  if (typeof address !== 'string') {
    return false;
  }

  // Check if it starts with 0x or 0X and has 40 hex characters
  const ethereumAddressRegex = /^0[xX][a-fA-F0-9]{40}$/;
  return ethereumAddressRegex.test(address);
}

/**
 * Validates transaction hash format
 */
function isValidTransactionHash(hash: string): boolean {
  if (typeof hash !== 'string') {
    return false;
  }

  // Check if it starts with 0x and has 64 hex characters
  const transactionHashRegex = /^0x[a-fA-F0-9]{64}$/;
  return transactionHashRegex.test(hash);
}

/**
 * Validates an array of positions, filtering out invalid ones
 * Requirements: 6.1, 6.2
 */
export function validateAndFilterPositions(positions: any[], currentUserAddress: string): Position[] {
  if (!Array.isArray(positions)) {
    console.error('validateAndFilterPositions: input is not an array', positions);
    return [];
  }

  const validPositions: Position[] = [];

  for (const position of positions) {
    // First validate the position data structure
    if (!validatePositionData(position)) {
      console.error('Excluding position due to invalid data structure:', position);
      continue;
    }

    // Then validate ownership
    if (!validateOwnership(position, currentUserAddress)) {
      console.error('Excluding position due to ownership mismatch:', position);
      continue;
    }

    validPositions.push(position);
  }

  console.log(`Validated ${validPositions.length} out of ${positions.length} positions`);
  return validPositions;
}