import React, { useState, useEffect } from 'react';
import { 
    ArrowLeft, 
    BookOpen, 
    Heart, 
    Download, 
    Share2, 
    ExternalLink, 
    Bookmark, 
    BookmarkCheck,
    MessageSquare,
    FileText
} from 'lucide-react';

interface Tag {
    id: number;
    type: string;
    name: string;
    count?: number;
}

interface Page {
    number: number;
    path: string;
    width: number;
    height: number;
    thumbnail: string;
    localFile?: string; // If offline downloaded
}

interface Gallery {
    id: number;
    media_id: string;
    title: {
        english?: string;
        japanese?: string;
        pretty: string;
    };
    cover?: {
        path: string;
    };
    thumbnail?: {
        path: string;
    };
    num_pages: number;
    num_favorites?: number;
    tags?: Tag[];
    pages: Page[];
    related?: any[];
    localPath?: string;
    offline?: boolean;
}

interface Comment {
    id: number;
    post_date: number;
    body: string;
    poster: {
        id: number;
        username: string;
        avatar_url: string;
        is_superuser: boolean;
        is_staff: boolean;
    };
}

interface CommentAvatarProps {
    username: string;
    avatarUrl?: string;
}

const CommentAvatar: React.FC<CommentAvatarProps> = ({ username, avatarUrl }) => {
    const [imgError, setImgError] = useState(false);
    
    const firstLetter = username ? username.charAt(0).toUpperCase() : '?';
    
    const getBgColor = (name: string) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = [
            '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', 
            '#3498db', '#9b59b6', '#34495e', '#16a085', '#27ae60', 
            '#2980b9', '#8e44ad', '#2c3e50', '#d35400', '#c0392b'
        ];
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    };

    if (avatarUrl && !imgError) {
        const fullUrl = `nhentai-image://i.nhentai.net/${avatarUrl}`;
        return (
            <img 
                src={fullUrl} 
                alt={username} 
                className="comment-avatar" 
                onError={() => setImgError(true)} 
            />
        );
    }

    const bgColor = getBgColor(username);
    return (
        <div 
            className="comment-avatar fallback" 
            style={{ backgroundColor: bgColor }}
        >
            {firstLetter}
        </div>
    );
};

interface GalleryDetailProps {
    galleryId: number;
    onBack: () => void;
    onRead: (gallery: Gallery, pageIndex?: number) => void;
    blacklistedTags: string[];
    onTagClick: (tagName: string) => void;
}

export const GalleryDetail: React.FC<GalleryDetailProps> = ({
    galleryId,
    onBack,
    onRead,
    blacklistedTags,
    onTagClick
}) => {
    const [gallery, setGallery] = useState<Gallery | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');
    const [isFavorited, setIsFavorited] = useState<boolean>(false);
    const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
    const [downloadStatus, setDownloadStatus] = useState<string>('');
    const [downloadProgress, setDownloadProgress] = useState<number>(0);
    const [copied, setCopied] = useState<boolean>(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loadingComments, setLoadingComments] = useState<boolean>(true);
    const [commentsError, setCommentsError] = useState<string>('');
    const [favAnimate, setFavAnimate] = useState<boolean>(false);
    const [bookAnimate, setBookAnimate] = useState<boolean>(false);
    const [pdfStatus, setPdfStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle');
    const [pdfProgress, setPdfProgress] = useState<number>(0);
    const [visiblePagesLimit, setVisiblePagesLimit] = useState<number>(24);

    const handleCopyId = async () => {
        if (!gallery) return;
        try {
            await (window as any).electron.copyToClipboard(gallery.id.toString());
        } catch (err) {
            navigator.clipboard.writeText(gallery.id.toString());
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    useEffect(() => {
        setVisiblePagesLimit(24);
        const loadDetail = async () => {
            setLoading(true);
            try {
                // First, check if we have this locally in offline downloads
                const downloads = await (window as any).electron.getDownloads();
                const localItem = downloads.find((d: any) => d.id === galleryId);
                
                if (localItem && localItem.status === 'failed' && localItem.error === 'Local files were deleted or moved.') {
                    setError('Local files were deleted or moved. Please redownload.');
                    setLoading(false);
                    return;
                }

                if (localItem && localItem.status === 'completed') {
                    // Load offline detail
                    const offlineData = await fetchOfflineMetadata(localItem.localPath);
                    if (offlineData) {
                        setGallery({
                            ...offlineData,
                            localPath: localItem.localPath,
                            offline: true
                        });
                        setDownloadStatus('completed');
                        setLoading(false);
                        checkFavoriteAndBookmark(galleryId);
                        return;
                    }
                }

                // If not downloaded or completed, load from API
                const settings = await (window as any).electron.getSettings();
                const apiUrl = `https://${settings.mirror}/api/v2/galleries/${galleryId}?include=related,favorite`;
                
                const response = await (window as any).electron.fetchApi(apiUrl);
                if (response.success) {
                    setGallery(response.data);
                    
                    // Set download state if in progress
                    if (localItem) {
                        setDownloadStatus(localItem.status);
                        setDownloadProgress(localItem.progress || 0);
                    }
                } else {
                    setError(response.error || 'Failed to load details.');
                }
            } catch (e: any) {
                setError(e.message || 'Error occurred while fetching.');
            } finally {
                setLoading(false);
            }
        };

        loadDetail();
        checkFavoriteAndBookmark(galleryId);
    }, [galleryId]);

    // Fetch Comments dynamically
    useEffect(() => {
        const fetchComments = async () => {
            setLoadingComments(true);
            setCommentsError('');
            try {
                const settings = await (window as any).electron.getSettings();
                const apiUrl = `https://${settings.mirror}/api/v2/galleries/${galleryId}/comments`;
                const response = await (window as any).electron.fetchApi(apiUrl);
                if (response.success) {
                    if (response.data && Array.isArray(response.data.result)) {
                        setComments(response.data.result);
                    } else if (Array.isArray(response.data)) {
                        setComments(response.data);
                    } else {
                        setComments([]);
                    }
                } else {
                    setCommentsError(response.error || 'Failed to load comments.');
                }
            } catch (e: any) {
                setCommentsError(e.message || 'Error occurred while loading comments.');
            } finally {
                setLoadingComments(false);
            }
        };

        fetchComments();
    }, [galleryId]);

    // Handle background progress reports
    useEffect(() => {
        const unsubscribe = (window as any).electron.onDownloadProgress((data: any) => {
            if (data.galleryId === galleryId) {
                setDownloadStatus(data.status);
                setDownloadProgress(data.progress);
                if (data.status === 'completed' && gallery) {
                    setGallery(prev => prev ? { ...prev, offline: true, localPath: data.localPath } : null);
                }
            }
        });
        return () => unsubscribe();
    }, [galleryId, gallery]);

    // Handle PDF export progress reports
    useEffect(() => {
        const unsubscribe = (window as any).electron.onPdfProgress((data: any) => {
            if (data.galleryId === galleryId) {
                setPdfStatus(data.status);
                setPdfProgress(data.progress);
                if (data.status === 'completed') {
                    setTimeout(() => {
                        setPdfStatus('idle');
                        setPdfProgress(0);
                    }, 4000);
                } else if (data.status === 'failed') {
                    (window as any).showToast(`Failed to export PDF: ${data.error || 'Unknown error'}`, 'error', {
                        id: gallery ? gallery.id : galleryId,
                        title: gallery ? (gallery.title.pretty || gallery.title.english || '') : 'PDF Export'
                    });
                    setTimeout(() => {
                        setPdfStatus('idle');
                        setPdfProgress(0);
                    }, 4000);
                }
            }
        });
        return () => unsubscribe();
    }, [galleryId]);

    const fetchOfflineMetadata = async (folderPath: string) => {
        try {
            // Using preload bridge fetch API to read offline files
            // Wait, we can just load metadata.json using window.fetch on file:// protocol
            const response = await fetch(`file://${folderPath}/metadata.json`.replace(/\\/g, '/'));
            return await response.json();
        } catch (e) {
            console.error('Failed to load offline metadata:', e);
            return null;
        }
    };

    const checkFavoriteAndBookmark = async (id: number) => {
        try {
            const favs = await (window as any).electron.getFavorites();
            setIsFavorited(favs.some((f: any) => f.id === id));

            const bookmarks = await (window as any).electron.getBookmarks();
            setIsBookmarked(bookmarks.some((b: any) => b.galleryId === id));
        } catch (e) {
            console.error(e);
        }
    };

    const handleFavoriteToggle = async () => {
        if (!gallery) return;
        setFavAnimate(true);
        setTimeout(() => setFavAnimate(false), 450);
        try {
            const isFav = await (window as any).electron.toggleFavorite(gallery);
            setIsFavorited(isFav);
        } catch (e) {
            console.error(e);
        }
    };

    const handleBookmarkToggle = async () => {
        if (!gallery) return;
        setBookAnimate(true);
        setTimeout(() => setBookAnimate(false), 450);
        try {
            const coverUrl = gallery.offline && gallery.localPath
                ? `file://${gallery.localPath}/cover.webp`.replace(/\\/g, '/')
                : `nhentai-image://t1.nhentai.net/${gallery.cover?.path || `galleries/${gallery.media_id}/cover.jpg`}`;

            const isBook = await (window as any).electron.toggleBookmark({
                galleryId: gallery.id,
                title: gallery.title.pretty,
                coverUrl: coverUrl,
                pages: gallery.num_pages
            });
            setIsBookmarked(isBook);
        } catch (e) {
            console.error(e);
        }
    };

    const handleDownload = async () => {
        if (!gallery) return;
        setDownloadStatus('queued');
        setDownloadProgress(0);
        await (window as any).electron.downloadGallery(gallery);
        (window as any).showToast('Gallery added to download queue successfully!', 'success', {
            id: gallery.id,
            title: gallery.title.pretty || gallery.title.english || ''
        });
    };

    const handleExportPDF = async () => {
        if (!gallery) return;
        try {
            setPdfStatus('processing');
            const res = await (window as any).electron.exportToPDF(gallery);
            if (res.status === 'cancelled') {
                setPdfStatus('idle');
            } else if (res.status === 'queued') {
                setPdfStatus('queued');
            }
        } catch (e: any) {
            console.error('Failed to export PDF', e);
            setPdfStatus('failed');
            (window as any).showToast(`Failed to start export: ${e.message}`, 'error', {
                id: gallery.id,
                title: gallery.title.pretty || gallery.title.english || ''
            });
        }
    };

    const handleShare = async () => {
        if (!gallery) return;
        const settings = await (window as any).electron.getSettings();
        const url = `https://${settings.mirror}/g/${gallery.id}`;
        navigator.clipboard.writeText(url);
        (window as any).showToast('Copied gallery link to clipboard!', 'success', {
            id: gallery.id,
            title: gallery.title.pretty || gallery.title.english || ''
        });
    };

    const handleOpenInBrowser = async () => {
        if (!gallery) return;
        const settings = await (window as any).electron.getSettings();
        const url = `https://${settings.mirror}/g/${gallery.id}`;
        await (window as any).electron.openInBrowser(url);
    };

    if (loading) {
        return (
            <div className="detail-overlay" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>Loading details...</div>
            </div>
        );
    }

    if (error || !gallery) {
        return (
            <div className="detail-overlay" style={{ alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <div style={{ fontSize: '18px', color: 'var(--primary)' }}>{error || 'Gallery not found.'}</div>
                <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Back</button>
            </div>
        );
    }

    // Group tags
    const tagsByCategory: { [key: string]: Tag[] } = {};
    const galleryTags = gallery.tags || [];
    galleryTags.forEach(tag => {
        if (!tagsByCategory[tag.type]) {
            tagsByCategory[tag.type] = [];
        }
        tagsByCategory[tag.type].push(tag);
    });

    const categoriesOrder = ['artist', 'group', 'parody', 'character', 'tag', 'language', 'category'];

    // Determine cover URL
    const coverUrl = gallery.offline && gallery.localPath
        ? `file://${gallery.localPath}/${gallery.cover?.path.split('/').pop() || 'cover.webp'}`.replace(/\\/g, '/')
        : `nhentai-image://t1.nhentai.net/${gallery.cover?.path || `galleries/${gallery.media_id}/cover.jpg`}`;

    return (
        <div className="detail-overlay">
            <div className="detail-header-actions">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft size={18} />
                    Back to Gallery
                </button>
            </div>

            <div className="detail-body">
                {/* Top Section: Cover & Metadata */}
                <div className="detail-main-row">
                    {/* Left Side Cover */}
                    <div className="detail-cover-container">
                        <img src={coverUrl} alt={gallery.title.pretty} className="detail-cover" />
                        
                        {/* Offline / Download info */}
                        {downloadStatus === 'downloading' && (
                            <div style={{ padding: '8px 0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                    <span>Downloading Offline</span>
                                    <span>{downloadProgress}%</span>
                                </div>
                                <div className="download-progress-bar-bg">
                                    <div className="download-progress-bar-fill" style={{ width: `${downloadProgress}%` }} />
                                </div>
                            </div>
                        )}

                        {downloadStatus === 'completed' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2ecc71', fontSize: '13px', fontWeight: 'bold', justifyContent: 'center' }}>
                                <span>✓ Available Offline</span>
                            </div>
                        )}
                    </div>

                    {/* Right Side Info */}
                    <div className="detail-info">
                        <div className="manga-titles">
                            <div 
                                onClick={handleCopyId}
                                title="Click to copy ID"
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px', 
                                    marginBottom: '6px', 
                                    cursor: 'pointer',
                                    width: 'fit-content'
                                }}
                            >
                                <span style={{ 
                                    backgroundColor: copied ? '#2ecc71' : 'var(--primary)', 
                                    color: '#fff', 
                                    fontSize: '11px', 
                                    fontWeight: 800, 
                                    padding: '3px 8px', 
                                    borderRadius: '10px', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.5px',
                                    transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                                    boxShadow: copied ? '0 0 8px rgba(46, 204, 113, 0.4)' : 'none'
                                }}>
                                    {copied ? '✓ Copied!' : `ID: ${gallery.id}`}
                                </span>
                            </div>
                            <h1 className="title-eng">{gallery.title.english || gallery.title.pretty}</h1>
                            {gallery.title.japanese && <div className="title-jp">{gallery.title.japanese}</div>}
                        </div>

                        <div className="manga-stats">
                            <div className="stat-item">
                                <BookOpen size={14} />
                                <span>{gallery.num_pages} pages</span>
                            </div>
                            {gallery.num_favorites !== undefined && (
                                <div className="stat-item">
                                    <Heart size={14} fill="var(--primary)" color="var(--primary)" />
                                    <span>
                                        {gallery.num_favorites >= 1000 
                                            ? (gallery.num_favorites / 1000).toFixed(1).replace(/\.0$/, '') + 'K' 
                                            : gallery.num_favorites} favorites
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="action-row">
                            <button className="btn-primary" onClick={() => onRead(gallery)}>
                                Read Now
                            </button>
                            
                            {downloadStatus !== 'completed' && downloadStatus !== 'downloading' && (
                                <button className="btn-secondary" onClick={handleDownload}>
                                    <Download size={16} /> Download Offline
                                </button>
                            )}

                            {downloadStatus === 'completed' && (
                                <button 
                                    className="btn-secondary" 
                                    onClick={handleExportPDF}
                                    disabled={pdfStatus === 'processing'}
                                >
                                    <FileText size={16} />
                                    {pdfStatus === 'queued' && 'PDF Queued...'}
                                    {pdfStatus === 'processing' && `Exporting PDF (${pdfProgress}%)...`}
                                    {pdfStatus === 'idle' && 'Export PDF'}
                                    {pdfStatus === 'completed' && 'PDF Exported!'}
                                    {pdfStatus === 'failed' && 'Export Failed'}
                                </button>
                            )}
                            
                            <button 
                                className={`btn-secondary btn-favorite ${isFavorited ? 'active' : ''} ${favAnimate ? 'heart-pulse' : ''}`} 
                                onClick={handleFavoriteToggle}
                            >
                                <Heart size={16} fill={isFavorited ? 'var(--primary)' : 'transparent'} />
                                {isFavorited ? 'Favorited' : 'Favorite'}
                            </button>

                            <button 
                                className={`btn-secondary ${isBookmarked ? 'active' : ''} ${bookAnimate ? 'heart-pulse' : ''}`} 
                                onClick={handleBookmarkToggle}
                                style={{ borderColor: isBookmarked ? 'var(--primary)' : 'var(--border-light)' }}
                            >
                                {isBookmarked ? <BookmarkCheck size={16} color="var(--primary)" /> : <Bookmark size={16} />}
                                Bookmark
                            </button>

                            <button className="btn-secondary" onClick={handleShare}>
                                <Share2 size={16} /> Share
                            </button>

                            <button className="btn-secondary" onClick={handleOpenInBrowser}>
                                <ExternalLink size={16} /> Browser
                            </button>
                        </div>

                        {/* Tags breakdown */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                            {categoriesOrder.map(category => {
                                const tags = tagsByCategory[category] || [];
                                if (tags.length === 0) return null;

                                return (
                                    <div className="tag-group" key={category}>
                                        <div className="tag-label">{category}s</div>
                                        <div className="tag-list">
                                            {tags.map(t => {
                                                const isExcluded = blacklistedTags.some(bt => 
                                                    bt.toLowerCase().trim() === t.name.toLowerCase().trim()
                                                );
                                                return (
                                                    <span 
                                                        key={t.id} 
                                                        className={`tag-badge ${isExcluded ? 'excluded' : ''}`}
                                                        onClick={() => onTagClick(t.name)}
                                                    >
                                                        {t.name} {t.count !== undefined && <span style={{ opacity: 0.5, fontSize: '11px' }}>({t.count})</span>}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Page thumbnails (Full Width) */}
                <div className="thumbnails-section">
                    <div className="thumbnails-title">Pages</div>
                    <div className="thumbnails-grid">
                        {gallery.pages.slice(0, visiblePagesLimit).map((page, index) => {
                            let thumbUrl = '';
                            if (gallery.offline && gallery.localPath) {
                                // Offline page thumbnail path
                                const pageName = page.localFile || `${page.number}.${page.path.split('.').pop() || 'webp'}`;
                                thumbUrl = `file://${gallery.localPath}/${pageName}`.replace(/\\/g, '/');
                            } else {
                                // Proxy via custom protocol
                                // e.g. path: galleries/4011896/1t.webp or similar
                                thumbUrl = `nhentai-image://t1.nhentai.net/${page.thumbnail || page.path.replace(/\.(\w+)$/, 't.$1')}`;
                            }

                            return (
                                <div 
                                    key={page.number} 
                                    className="thumb-card"
                                    onClick={() => onRead(gallery, index)}
                                >
                                    <img src={thumbUrl} alt={`Page ${page.number}`} className="thumb-img" loading="lazy" />
                                    <div style={{ textAlign: 'center', fontSize: '11px', padding: '4px 0', color: 'var(--text-secondary)' }}>
                                        {page.number}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {gallery.pages.length > 24 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
                            {visiblePagesLimit < gallery.pages.length && (
                                <>
                                    <button 
                                        className="btn-secondary" 
                                        onClick={() => setVisiblePagesLimit(p => p + 24)}
                                        style={{ padding: '8px 16px', fontSize: '12px' }}
                                    >
                                        Show More
                                    </button>
                                    <button 
                                        className="btn-primary" 
                                        onClick={() => setVisiblePagesLimit(gallery.pages.length)}
                                        style={{ padding: '8px 16px', fontSize: '12px' }}
                                    >
                                        Show All
                                    </button>
                                </>
                            )}
                            {visiblePagesLimit > 24 && (
                                <button 
                                    className="btn-secondary" 
                                    onClick={() => setVisiblePagesLimit(24)}
                                    style={{ padding: '8px 16px', fontSize: '12px' }}
                                >
                                    Show Less
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Comments Section */}
                <div className="comments-section">
                    <div className="comments-title">
                        <MessageSquare size={18} style={{ color: 'var(--primary)' }} />
                        Comments ({comments.length})
                    </div>
                    {loadingComments ? (
                        <div className="comments-loading">Loading comments...</div>
                    ) : commentsError ? (
                        <div className="comments-error">
                            {gallery.offline ? 'Comments are not available offline.' : commentsError}
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="comments-empty">No comments yet.</div>
                    ) : (
                        <div className="comments-list">
                            {comments.map(comment => (
                                <div key={comment.id} className="comment-card">
                                    <CommentAvatar username={comment.poster.username} avatarUrl={comment.poster.avatar_url} />
                                    <div className="comment-content">
                                        <div className="comment-header">
                                            <span className="comment-username">
                                                {comment.poster.username}
                                                {comment.poster.is_staff && <span className="comment-badge staff">Staff</span>}
                                                {comment.poster.is_superuser && <span className="comment-badge admin">Admin</span>}
                                            </span>
                                            <span className="comment-date">
                                                {new Date(comment.post_date * 1000).toLocaleDateString(undefined, {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                        <div className="comment-body">{comment.body}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
