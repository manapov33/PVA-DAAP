/**
 * Data Management Panel - UI for managing user data and storage
 * Provides interface for cache management, settings, and data export/import
 */

import React, { useState } from 'react';
import { useDataManager } from '../hooks/useDataManager';
import { UserSettings } from '../types/user';

interface DataManagementPanelProps {
  userAddress?: string;
  onClose: () => void;
  blockchainSyncFunction?: (address: string) => Promise<any[]>;
}

export const DataManagementPanel: React.FC<DataManagementPanelProps> = ({
  userAddress,
  onClose,
  blockchainSyncFunction,
}) => {
  const dataManager = useDataManager(userAddress, blockchainSyncFunction);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'cache' | 'export'>('overview');
  const [exportData, setExportData] = useState<string>('');
  const [importData, setImportData] = useState<string>('');

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const handleExportData = async () => {
    try {
      // This would need to be implemented in the data manager
      // const exported = await dataManager.exportData();
      // setExportData(exported);
      setExportData('Export functionality will be implemented');
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleImportData = async () => {
    try {
      // This would need to be implemented in the data manager
      // await dataManager.importData(importData);
      console.log('Import functionality will be implemented');
      setImportData('');
    } catch (error) {
      console.error('Import failed:', error);
    }
  };

  const handleSettingsUpdate = async (newSettings: Partial<UserSettings>) => {
    try {
      await dataManager.updateSettings(newSettings);
    } catch (error) {
      console.error('Settings update failed:', error);
    }
  };

  const TabButton: React.FC<{ id: string; label: string; active: boolean; onClick: () => void }> = ({
    id,
    label,
    active,
    onClick,
  }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );

  const OverviewTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Data Layers Status</h3>
        <div className="space-y-3">
          {dataManager.dataLayers.map((layer) => (
            <div
              key={layer.name}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    layer.available ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="font-medium capitalize">{layer.name}</span>
                <span className="text-sm text-gray-500">Priority: {layer.priority}</span>
              </div>
              <span
                className={`text-sm ${
                  layer.available ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {layer.available ? 'Available' : 'Unavailable'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Sync Status</h3>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex justify-between">
            <span>Last Sync:</span>
            <span>
              {dataManager.syncStatus.lastSync
                ? formatDate(dataManager.syncStatus.lastSync)
                : 'Never'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Status:</span>
            <span
              className={
                dataManager.syncStatus.syncInProgress
                  ? 'text-blue-600'
                  : dataManager.syncStatus.syncError
                  ? 'text-red-600'
                  : 'text-green-600'
              }
            >
              {dataManager.syncStatus.syncInProgress
                ? 'Syncing...'
                : dataManager.syncStatus.syncError
                ? 'Error'
                : 'Ready'}
            </span>
          </div>
          {dataManager.syncStatus.syncError && (
            <div className="text-red-600 text-sm mt-2">
              {dataManager.syncStatus.syncError}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Current Data</h3>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex justify-between">
            <span>Positions in Memory:</span>
            <span>{dataManager.positions.length}</span>
          </div>
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          onClick={dataManager.refreshFromBlockchain}
          disabled={dataManager.loading || !dataManager.dataLayers.find(l => l.name === 'blockchain')?.available}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Sync from Blockchain
        </button>
        <button
          onClick={dataManager.refreshFromCache}
          disabled={dataManager.loading}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Load from Cache
        </button>
      </div>
    </div>
  );

  const SettingsTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Theme Settings</h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <span>Theme:</span>
            <select
              value={dataManager.settings.theme}
              onChange={(e) => handleSettingsUpdate({ theme: e.target.value as any })}
              className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </select>
          </label>
          <label className="flex items-center space-x-3">
            <span>Language:</span>
            <select
              value={dataManager.settings.language}
              onChange={(e) => handleSettingsUpdate({ language: e.target.value as any })}
              className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800"
            >
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Trading Settings</h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <span>Default Amount (USDT):</span>
            <input
              type="number"
              min="20"
              value={dataManager.settings.trading.defaultAmount}
              onChange={(e) => handleSettingsUpdate({ 
                trading: { 
                  ...dataManager.settings.trading, 
                  defaultAmount: parseInt(e.target.value) 
                } 
              })}
              className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800"
            />
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataManager.settings.trading.autoRefresh}
              onChange={(e) => handleSettingsUpdate({ 
                trading: { 
                  ...dataManager.settings.trading, 
                  autoRefresh: e.target.checked 
                } 
              })}
            />
            <span>Auto Refresh</span>
          </label>
          <label className="flex items-center space-x-3">
            <span>Refresh Interval (seconds):</span>
            <input
              type="number"
              min="5"
              max="300"
              value={dataManager.settings.trading.refreshInterval}
              onChange={(e) => handleSettingsUpdate({ 
                trading: { 
                  ...dataManager.settings.trading, 
                  refreshInterval: parseInt(e.target.value) 
                } 
              })}
              className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-800"
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Notifications</h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataManager.settings.notifications.transactions}
              onChange={(e) => handleSettingsUpdate({ 
                notifications: { 
                  ...dataManager.settings.notifications, 
                  transactions: e.target.checked 
                } 
              })}
            />
            <span>Transaction Notifications</span>
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataManager.settings.notifications.priceAlerts}
              onChange={(e) => handleSettingsUpdate({ 
                notifications: { 
                  ...dataManager.settings.notifications, 
                  priceAlerts: e.target.checked 
                } 
              })}
            />
            <span>Price Alerts</span>
          </label>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={dataManager.settings.notifications.systemUpdates}
              onChange={(e) => handleSettingsUpdate({ 
                notifications: { 
                  ...dataManager.settings.notifications, 
                  systemUpdates: e.target.checked 
                } 
              })}
            />
            <span>System Updates</span>
          </label>
        </div>
      </div>
    </div>
  );

  const CacheTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Cache Statistics</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-500">Total Users</div>
            <div className="text-2xl font-bold">{dataManager.cacheStats.totalUsers}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-500">Total Size</div>
            <div className="text-2xl font-bold">{formatBytes(dataManager.cacheStats.totalSize)}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-500">Compressed Entries</div>
            <div className="text-2xl font-bold">{dataManager.cacheStats.compressedEntries}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-500">Encrypted Entries</div>
            <div className="text-2xl font-bold">{dataManager.cacheStats.encryptedEntries}</div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Cache Management</h3>
        <div className="space-y-3">
          <button
            onClick={dataManager.saveToCache}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Save Current Data to Cache
          </button>
          <button
            onClick={dataManager.clearCache}
            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            Clear Cache for Current User
          </button>
        </div>
      </div>

      {dataManager.cacheStats.oldestEntry && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Cache Info</h3>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between">
              <span>Oldest Entry:</span>
              <span>{formatDate(dataManager.cacheStats.oldestEntry)}</span>
            </div>
            <div className="flex justify-between">
              <span>Compression Ratio:</span>
              <span>{(dataManager.cacheStats.averageCompressionRatio * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const ExportTab = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Export Data</h3>
        <button
          onClick={handleExportData}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 mb-4"
        >
          Export User Data
        </button>
        {exportData && (
          <textarea
            value={exportData}
            readOnly
            rows={10}
            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 font-mono text-sm"
            placeholder="Exported data will appear here..."
          />
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Import Data</h3>
        <textarea
          value={importData}
          onChange={(e) => setImportData(e.target.value)}
          rows={10}
          className="w-full p-3 border rounded-lg bg-white dark:bg-gray-800 font-mono text-sm mb-4"
          placeholder="Paste exported data here..."
        />
        <button
          onClick={handleImportData}
          disabled={!importData.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Import Data
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Data Management</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex space-x-2 mb-6">
          <TabButton
            id="overview"
            label="Overview"
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
          />
          <TabButton
            id="settings"
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
          <TabButton
            id="cache"
            label="Cache"
            active={activeTab === 'cache'}
            onClick={() => setActiveTab('cache')}
          />
          <TabButton
            id="export"
            label="Export/Import"
            active={activeTab === 'export'}
            onClick={() => setActiveTab('export')}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'cache' && <CacheTab />}
          {activeTab === 'export' && <ExportTab />}
        </div>

        {dataManager.error && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
            <div className="text-red-700 dark:text-red-300 text-sm">{dataManager.error}</div>
          </div>
        )}
      </div>
    </div>
  );
};