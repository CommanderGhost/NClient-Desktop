const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // API network bridge
    fetchApi: (url, options) => ipcRenderer.invoke('fetch-api', url, options),

    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    verifyNhentaiSession: (cookiesString) => ipcRenderer.invoke('verify-nhentai-session', cookiesString),
    loginNhentai: () => ipcRenderer.invoke('login-nhentai'),
    getOnlineFavorites: (page) => ipcRenderer.invoke('get-online-favorites', page),
    logoutNhentai: () => ipcRenderer.invoke('logout-nhentai'),

    // Favorites
    getFavorites: () => ipcRenderer.invoke('get-favorites'),
    toggleFavorite: (gallery) => ipcRenderer.invoke('toggle-favorite', gallery),

    // Bookmarks
    getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
    toggleBookmark: (bookmark) => ipcRenderer.invoke('toggle-bookmark', bookmark),

    // Downloads
    downloadGallery: (gallery) => ipcRenderer.invoke('download-gallery', gallery),
    getDownloads: () => ipcRenderer.invoke('get-downloads'),
    deleteDownload: (galleryId) => ipcRenderer.invoke('delete-download', galleryId),
    startDownloadQueue: () => ipcRenderer.invoke('start-download-queue'),
    pauseDownload: (galleryId) => ipcRenderer.invoke('pause-download', galleryId),
    resumeDownload: (galleryId) => ipcRenderer.invoke('resume-download', galleryId),
    cancelDownload: (galleryId) => ipcRenderer.invoke('cancel-download', galleryId),
    exportToPDF: (gallery) => ipcRenderer.invoke('export-to-pdf', gallery),
    pauseAllDownloads: () => ipcRenderer.invoke('pause-all-downloads'),
    cancelAllDownloads: () => ipcRenderer.invoke('cancel-all-downloads'),
    deleteAllDownloads: () => ipcRenderer.invoke('delete-all-downloads'),
    exportAllToPDF: () => ipcRenderer.invoke('export-all-to-pdf'),

    // Browser utilities
    openInBrowser: (url) => ipcRenderer.invoke('open-in-browser', url),
    copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // Event listeners
    onDownloadProgress: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('download-progress', subscription);
        return () => ipcRenderer.removeListener('download-progress', subscription);
    },
    onPdfProgress: (callback) => {
        const subscription = (event, data) => callback(data);
        ipcRenderer.on('pdf-progress', subscription);
        return () => ipcRenderer.removeListener('pdf-progress', subscription);
    }
});
