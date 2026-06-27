import React, { useState, useEffect, useRef } from 'react';
import { 
    X, 
    ChevronLeft, 
    ChevronRight, 
    Bookmark, 
    BookmarkCheck, 
    LayoutList, 
    BookOpen 
} from 'lucide-react';

interface Page {
    number: number;
    path: string;
    width: number;
    height: number;
    localFile?: string; // If offline
}

interface Gallery {
    id: number;
    title: {
        pretty: string;
    };
    pages: Page[];
    localPath?: string;
    offline?: boolean;
    cover?: {
        path: string;
    };
    media_id?: string;
}

interface ReaderProps {
    gallery: Gallery;
    initialPageIndex?: number;
    onClose: () => void;
}

type ReadMode = 'single' | 'webtoon';

export const Reader: React.FC<ReaderProps> = ({
    gallery,
    initialPageIndex = 0,
    onClose
}) => {
    const [pageIndex, setPageIndex] = useState<number>(initialPageIndex);
    const [readMode, setReadMode] = useState<ReadMode>('single');
    const [showHud, setShowHud] = useState<boolean>(true);
    const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
    
    const webtoonRef = useRef<HTMLDivElement>(null);

    // Synchronize keyboard bindings
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (readMode === 'single') {
                if (e.key === 'ArrowLeft') {
                    handlePrevPage();
                } else if (e.key === 'ArrowRight' || e.key === ' ') {
                    handleNextPage();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pageIndex, readMode]);

    useEffect(() => {
        checkBookmark();
    }, [pageIndex, gallery.id]);

    // Intersection Observer to update pageIndex during scroll in webtoon mode
    useEffect(() => {
        if (readMode !== 'webtoon' || !webtoonRef.current) return;

        const observerOptions = {
            root: webtoonRef.current,
            rootMargin: '0px',
            threshold: 0.25
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const idxAttr = entry.target.getAttribute('data-index');
                    if (idxAttr !== null) {
                        const idx = parseInt(idxAttr, 10);
                        setPageIndex(idx);
                    }
                }
            });
        }, observerOptions);

        const wrappers = webtoonRef.current.querySelectorAll('.webtoon-page-wrapper');
        wrappers.forEach((el) => observer.observe(el));

        return () => {
            observer.disconnect();
        };
    }, [readMode, gallery.pages]);

    const checkBookmark = async () => {
        try {
            const list = await (window as any).electron.getBookmarks();
            const exists = list.some((b: any) => b.galleryId === gallery.id && b.pageNumber === pageIndex + 1);
            setIsBookmarked(exists);
        } catch (e) {
            console.error(e);
        }
    };

    const handleBookmarkToggle = async () => {
        try {
            const coverUrl = gallery.offline && gallery.localPath
                ? `file://${gallery.localPath}/cover.webp`.replace(/\\/g, '/')
                : `nhentai-image://t1.nhentai.net/${gallery.cover?.path || `galleries/${gallery.media_id}/cover.jpg`}`;

            const exists = await (window as any).electron.toggleBookmark({
                galleryId: gallery.id,
                title: gallery.title.pretty,
                coverUrl: coverUrl,
                pageNumber: pageIndex + 1
            });
            setIsBookmarked(exists);
        } catch (e) {
            console.error(e);
        }
    };

    const handleNextPage = () => {
        if (pageIndex < gallery.pages.length - 1) {
            const nextIdx = pageIndex + 1;
            setPageIndex(nextIdx);
            if (readMode === 'webtoon' && webtoonRef.current) {
                const wrappers = webtoonRef.current.querySelectorAll('.webtoon-page-wrapper');
                if (wrappers[nextIdx]) {
                    wrappers[nextIdx].scrollIntoView({ behavior: 'smooth' });
                }
            }
        }
    };

    const handlePrevPage = () => {
        if (pageIndex > 0) {
            const prevIdx = pageIndex - 1;
            setPageIndex(prevIdx);
            if (readMode === 'webtoon' && webtoonRef.current) {
                const wrappers = webtoonRef.current.querySelectorAll('.webtoon-page-wrapper');
                if (wrappers[prevIdx]) {
                    wrappers[prevIdx].scrollIntoView({ behavior: 'smooth' });
                }
            }
        }
    };

    const toggleHud = (e: React.MouseEvent) => {
        // Prevent toggling HUD when clicking on interactive overlays
        const target = e.target as HTMLElement;
        if (target.closest('.reader-header') || target.closest('.reader-controls') || target.closest('.reader-tap-left') || target.closest('.reader-tap-right')) {
            return;
        }
        setShowHud(prev => !prev);
    };

    const getPageUrl = (page: Page) => {
        if (gallery.offline && gallery.localPath) {
            // Local offline file
            const pageName = page.localFile || `${page.number}.${page.path.split('.').pop() || 'webp'}`;
            return `file://${gallery.localPath}/${pageName}`.replace(/\\/g, '/');
        } else {
            // Proxy via custom protocol
            return `nhentai-image://i1.nhentai.net/${page.path}`;
        }
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        setPageIndex(val);
        
        if (readMode === 'webtoon' && webtoonRef.current) {
            const wrappers = webtoonRef.current.querySelectorAll('.webtoon-page-wrapper');
            if (wrappers[val]) {
                wrappers[val].scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    return (
        <div className="reader-overlay" onClick={toggleHud}>
            {/* Header HUD */}
            {showHud && (
                <div className="reader-header">
                    <button className="reader-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                    
                    <div className="reader-title" title={gallery.title.pretty}>
                        {gallery.title.pretty}
                    </div>

                    <div className="reader-controls">
                        {/* Toggle layout */}
                        <button 
                            className="reader-btn" 
                            onClick={() => setReadMode(prev => prev === 'single' ? 'webtoon' : 'single')}
                            title={readMode === 'single' ? 'Switch to Continuous Scroll' : 'Switch to Single Page'}
                        >
                            {readMode === 'single' ? <LayoutList size={20} /> : <BookOpen size={20} />}
                        </button>

                        {/* Bookmark page */}
                        <button 
                            className="reader-btn" 
                            onClick={handleBookmarkToggle}
                            title="Bookmark Page"
                        >
                            {isBookmarked ? (
                                <BookmarkCheck size={20} color="var(--primary)" />
                            ) : (
                                <Bookmark size={20} />
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Viewer body */}
            <div className="reader-body">
                {readMode === 'single' ? (
                    <div className="reader-page-container">
                        {/* Swipe Tap Areas */}
                        <div className="reader-tap-left" onClick={handlePrevPage} />
                        <div className="reader-tap-right" onClick={handleNextPage} />

                        <img 
                            src={getPageUrl(gallery.pages[pageIndex])} 
                            alt={`Page ${pageIndex + 1}`} 
                            className="reader-img"
                            key={pageIndex} // force reload/animation trigger
                        />
                    </div>
                ) : (
                    <div className="webtoon-scroll-container" ref={webtoonRef}>
                        {gallery.pages.map((page, index) => {
                            const isVisible = Math.abs(index - pageIndex) <= 2;
                            return (
                                <div 
                                    key={page.number} 
                                    className="webtoon-page-wrapper"
                                    data-index={index}
                                    style={{
                                        width: '100%',
                                        maxWidth: '720px',
                                        aspectRatio: page.width && page.height ? `${page.width} / ${page.height}` : undefined,
                                        minHeight: page.width && page.height ? undefined : '1000px',
                                        margin: '0 auto',
                                        background: 'var(--bg-panel-solid)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 'var(--border-radius-sm)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {isVisible ? (
                                        <img 
                                            src={getPageUrl(page)} 
                                            alt={`Page ${page.number}`} 
                                            className="webtoon-img" 
                                        />
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600 }}>
                                            Loading Page {page.number}...
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer HUD */}
            {showHud && (
                <div 
                    className="reader-header" 
                    style={{ 
                        position: 'absolute', 
                        bottom: 0, 
                        left: 0,
                        right: 0,
                        top: 'auto', 
                        borderBottom: 'none', 
                        borderTop: '1px solid var(--border-light)',
                        height: '70px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 32px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '600px' }}>
                        <button className="reader-btn" onClick={handlePrevPage} disabled={pageIndex === 0}>
                            <ChevronLeft size={20} />
                        </button>
                        
                        <input 
                            type="range" 
                            min="0" 
                            max={gallery.pages.length - 1} 
                            value={pageIndex}
                            onChange={handleSliderChange}
                            style={{ 
                                flexGrow: 1, 
                                accentColor: 'var(--primary)',
                                height: '4px',
                                cursor: 'pointer'
                            }} 
                        />
                        
                        <button className="reader-btn" onClick={handleNextPage} disabled={pageIndex === gallery.pages.length - 1}>
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <div className="reader-page-indicator" style={{ position: 'absolute', right: '32px', fontWeight: 'bold' }}>
                        {pageIndex + 1} / {gallery.pages.length}
                    </div>
                </div>
            )}
        </div>
    );
};
