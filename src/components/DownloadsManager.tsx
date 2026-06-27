import React, { useState, useEffect } from 'react';
import { Trash2, BookOpen, HardDriveDownload, Play, Pause, XCircle, RefreshCw, FileText } from 'lucide-react';

interface DownloadItem {
    id: number;
    title: {
        pretty: string;
    };
    cover?: {
        path: string;
    };
    num_pages: number;
    localPath: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'paused';
    progress: number;
    error?: string;
}

interface DownloadsManagerProps {
    onSelectGallery: (id: number) => void;
}

export const DownloadsManager: React.FC<DownloadsManagerProps> = ({
    onSelectGallery
}) => {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [pdfTotalCount, setPdfTotalCount] = useState<number>(0);
    const [pdfProcessedCount, setPdfProcessedCount] = useState<number>(0);
    const [exportedIds, setExportedIds] = useState<Set<number>>(new Set());

    const isExportingPdf = exportedIds.size > 0;

    const loadDownloads = async () => {
        setLoading(true);
        try {
            const data = await (window as any).electron.getDownloads();
            setDownloads(data);
        } catch (e) {
            console.error('Failed to load downloads:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDownloads();

        // Subscribe to progress changes from backend
        const unsubscribe = (window as any).electron.onDownloadProgress((data: any) => {
            if (data.status === 'deleted') {
                setDownloads(prev => prev.filter(d => d.id !== data.galleryId));
                return;
            }
            setDownloads(prev => {
                const list = [...prev];
                const index = list.findIndex(d => d.id === data.galleryId);
                if (index > -1) {
                    list[index] = {
                        ...list[index],
                        status: data.status,
                        progress: data.progress,
                        localPath: data.localPath || list[index].localPath
                    };
                } else {
                    // Refresh if a new download started in background
                    loadDownloads();
                }
                return list;
            });
        });

        // Subscribe to PDF conversion progress
        const unsubscribePdf = (window as any).electron.onPdfProgress((data: any) => {
            const { galleryId, status } = data;
            if (status === 'completed' || status === 'failed') {
                setExportedIds(prev => {
                    if (prev.has(galleryId)) {
                        const next = new Set(prev);
                        next.delete(galleryId);
                        setPdfProcessedCount(c => c + 1);
                        if (next.size === 0) {
                            (window as any).showToast('All PDF exports completed!', 'success');
                        }
                        return next;
                    }
                    return prev;
                });
            }
        });

        return () => {
            unsubscribe();
            unsubscribePdf();
        };
    }, []);

    const handlePause = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await (window as any).electron.pauseDownload(id);
            setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'paused' } : d));
        } catch (err) {
            console.error('Failed to pause download:', err);
        }
    };

    const handleResume = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await (window as any).electron.resumeDownload(id);
            setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'queued' } : d));
        } catch (err) {
            console.error('Failed to resume download:', err);
        }
    };

    const handleCancel = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const item = downloads.find(d => d.id === id);
        (window as any).showConfirm(
            'Cancel Download',
            'Are you sure you want to cancel this download?',
            async () => {
                try {
                    await (window as any).electron.cancelDownload(id);
                    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'failed' } : d));
                } catch (err: any) {
                    console.error('Failed to cancel download:', err);
                    (window as any).showToast(`Failed to cancel download: ${err.message}`, 'error', {
                        id: id,
                        title: item ? item.title.pretty : 'Manga'
                    });
                }
            }
        );
    };

    const handleDeleteClick = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const item = downloads.find(d => d.id === id);
        (window as any).showConfirm(
            'Confirm Delete',
            'Are you sure you want to delete this download from your disk?',
            async () => {
                const success = await (window as any).electron.deleteDownload(id);
                if (success) {
                    setDownloads(prev => prev.filter(d => d.id !== id));
                } else {
                    (window as any).showToast('Failed to delete download.', 'error', {
                        id: id,
                        title: item ? item.title.pretty : 'Manga'
                    });
                }
            }
        );
    };

    const handleDownloadAll = async () => {
        const targets = downloads.filter(d => d.status === 'paused' || d.status === 'failed');
        if (targets.length === 0) return;
        for (const item of targets) {
            try {
                await (window as any).electron.resumeDownload(item.id);
            } catch (err) {
                console.error('Failed to resume:', item.id, err);
            }
        }
        (window as any).showToast('Resuming all paused/failed downloads.', 'success');
        loadDownloads();
    };

    const handlePauseAll = async () => {
        try {
            await (window as any).electron.pauseAllDownloads();
            (window as any).showToast('All downloads paused.', 'info');
            loadDownloads();
        } catch (err) {
            console.error('Failed to pause all:', err);
        }
    };

    const handleCancelAll = async () => {
        try {
            await (window as any).electron.cancelAllDownloads();
            (window as any).showToast('All active downloads cancelled.', 'info');
            loadDownloads();
        } catch (err) {
            console.error('Failed to cancel all:', err);
        }
    };

    const handleDeleteAll = async () => {
        (window as any).showConfirm(
            'Confirm Delete All',
            'Are you sure you want to delete ALL downloads from your disk? This cannot be undone.',
            async () => {
                try {
                    await (window as any).electron.deleteAllDownloads();
                    (window as any).showToast('All downloads deleted.', 'success');
                    setDownloads([]);
                } catch (err) {
                    console.error('Failed to delete all:', err);
                }
            }
        );
    };

    const handleExportAllToPDF = async () => {
        const completedItems = downloads.filter(d => d.status === 'completed');
        const completedCount = completedItems.length;
        if (completedCount === 0) {
            (window as any).showToast('No completed downloads available to export.', 'error');
            return;
        }

        setPdfTotalCount(completedCount);
        setPdfProcessedCount(0);

        try {
            const result = await (window as any).electron.exportAllToPDF();
            if (result.success) {
                (window as any).showToast(`Successfully queued ${result.count} books for PDF export to ${result.saveDir}`, 'success');
                const queuedIds = completedItems.map(item => item.id);
                setExportedIds(new Set(queuedIds));
            } else {
                (window as any).showToast(`Failed to export: ${result.error}`, 'error');
                setExportedIds(new Set());
            }
        } catch (err: any) {
            console.error('Failed to export all to PDF:', err);
            (window as any).showToast(`Failed to export all: ${err.message}`, 'error');
            setExportedIds(new Set());
        }
    };

    if (loading) {
        return <div className="content-body" style={{ color: 'var(--text-secondary)' }}>Loading offline downloads...</div>;
    }

    const hasQueued = downloads.some(d => d.status === 'queued');
    const hasDownloading = downloads.some(d => d.status === 'downloading');

    const handleStartQueue = async () => {
        try {
            await (window as any).electron.startDownloadQueue();
            loadDownloads();
        } catch (e) {
            console.error('Failed to start queue:', e);
        }
    };

    return (
        <div className="content-body" style={{ overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <HardDriveDownload size={22} className="logo-icon" />
                    <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Offline Library ({downloads.length})</h2>
                </div>
                {hasQueued && !hasDownloading && (
                    <button 
                        className="btn-primary" 
                        onClick={handleStartQueue}
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                        Start Download
                    </button>
                )}
            </div>

            {downloads.length > 0 && (
                <div className="bulk-btn-container">
                    <button 
                        className="bulk-btn bulk-btn-download" 
                        onClick={handleDownloadAll}
                        disabled={!downloads.some(d => d.status === 'paused' || d.status === 'failed')}
                    >
                        <Play size={14} />
                        Download All
                    </button>

                    <button 
                        className="bulk-btn bulk-btn-pause" 
                        onClick={handlePauseAll}
                        disabled={!downloads.some(d => d.status === 'downloading' || d.status === 'queued')}
                    >
                        <Pause size={14} />
                        Pause All
                    </button>

                    <button 
                        className="bulk-btn bulk-btn-cancel" 
                        onClick={handleCancelAll}
                        disabled={!downloads.some(d => d.status === 'downloading' || d.status === 'queued')}
                    >
                        <XCircle size={14} />
                        Cancel All
                    </button>

                    <button 
                        className="bulk-btn bulk-btn-pdf" 
                        onClick={handleExportAllToPDF}
                        disabled={isExportingPdf || !downloads.some(d => d.status === 'completed')}
                    >
                        {isExportingPdf ? (
                            <>
                                <RefreshCw className="animate-spin" size={14} />
                                Exporting ({pdfProcessedCount}/{pdfTotalCount})...
                            </>
                        ) : (
                            <>
                                <FileText size={14} />
                                Export All to PDF
                            </>
                        )}
                    </button>

                    <button 
                        className="bulk-btn bulk-btn-delete" 
                        onClick={handleDeleteAll}
                    >
                        <Trash2 size={14} />
                        Delete All
                    </button>
                </div>
            )}

            {downloads.length === 0 ? (
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '80px 0', 
                    gap: '16px',
                    color: 'var(--text-muted)'
                }}>
                    <BookOpen size={48} />
                    <span>No offline downloads found. Items you download will show up here.</span>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {downloads.map(item => {
                        const coverPath = `${item.localPath}/${item.cover?.path.split('/').pop() || 'cover.webp'}`.replace(/\\/g, '/');
                        const coverUrl = `file://${coverPath}`;

                        return (
                            <div 
                                key={item.id} 
                                className="download-item-row"
                                onClick={() => {
                                    if (item.status === 'failed' && item.error === 'Local files were deleted or moved.') {
                                        (window as any).showToast('Cannot open: Local files were deleted or moved. Please redownload.', 'error', {
                                            id: item.id,
                                            title: item.title.pretty
                                        });
                                        return;
                                    }
                                    onSelectGallery(item.id);
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <img 
                                    src={coverUrl} 
                                    alt={item.title.pretty} 
                                    className="download-thumb"
                                    onError={(e) => {
                                        // fallback if file:// failed
                                        (e.target as HTMLImageElement).src = `nhentai-image://t1.nhentai.net/${item.cover?.path}`;
                                    }}
                                />
                                
                                <div className="download-info-section">
                                    <div className="download-title-text" title={item.title.pretty}>
                                        {item.title.pretty}
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
                                        <span className={`download-status-badge ${item.status}`}>
                                            {item.status}
                                        </span>
                                        <span style={{ color: 'var(--text-secondary)' }}>
                                            {item.num_pages} Pages
                                        </span>
                                        {(item.status === 'downloading' || item.status === 'paused') && (
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                {item.progress}% Completed
                                            </span>
                                        )}
                                    </div>

                                    {(item.status === 'downloading' || item.status === 'paused') && (
                                        <div className="download-progress-bar-bg" style={{ marginTop: '4px' }}>
                                            <div className="download-progress-bar-fill" style={{ width: `${item.progress}%` }} />
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                                    {/* Pause button for downloading or queued */}
                                    {(item.status === 'downloading' || item.status === 'queued') && (
                                        <button
                                            className="reader-btn"
                                            onClick={(e) => handlePause(item.id, e)}
                                            title="Pause download"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = '#3498db'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        >
                                            <Pause size={18} />
                                        </button>
                                    )}

                                    {/* Resume button for paused or failed */}
                                    {(item.status === 'paused' || item.status === 'failed') && (
                                        <button
                                            className="reader-btn"
                                            onClick={(e) => handleResume(item.id, e)}
                                            title={item.status === 'failed' ? "Retry download" : "Resume download"}
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = '#2ecc71'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        >
                                            {item.status === 'failed' ? <RefreshCw size={18} /> : <Play size={18} />}
                                        </button>
                                    )}

                                    {/* Cancel button for active, queued or paused downloads */}
                                    {(item.status === 'downloading' || item.status === 'queued' || item.status === 'paused') && (
                                        <button
                                            className="reader-btn"
                                            onClick={(e) => handleCancel(item.id, e)}
                                            title="Cancel and delete download"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        >
                                            <XCircle size={18} />
                                        </button>
                                    )}

                                    {/* Trash Delete button for completed or failed downloads */}
                                    {(item.status === 'completed' || item.status === 'failed') && (
                                        <button 
                                            className="reader-btn" 
                                            onClick={(e) => handleDeleteClick(item.id, e)}
                                            title="Delete offline data"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
