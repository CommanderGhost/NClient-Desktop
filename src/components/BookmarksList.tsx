import React, { useState, useEffect } from 'react';
import { Bookmark, Trash2, Play } from 'lucide-react';

interface BookmarkItem {
    galleryId: number;
    title: string;
    coverUrl: string;
    pageNumber: number;
}

interface BookmarksListProps {
    onSelectBookmark: (galleryId: number, pageIndex: number) => void;
}

export const BookmarksList: React.FC<BookmarksListProps> = ({
    onSelectBookmark
}) => {
    const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const loadBookmarks = async () => {
        setLoading(true);
        try {
            const data = await (window as any).electron.getBookmarks();
            setBookmarks(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBookmarks();
    }, []);

    const handleDelete = async (item: BookmarkItem, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await (window as any).electron.toggleBookmark(item);
            setBookmarks(prev => prev.filter(b => !(b.galleryId === item.galleryId && b.pageNumber === item.pageNumber)));
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) {
        return <div className="content-body" style={{ color: 'var(--text-secondary)' }}>Loading bookmarks...</div>;
    }

    return (
        <div className="content-body" style={{ overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                <Bookmark size={22} className="logo-icon" />
                <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>Bookmarks ({bookmarks.length})</h2>
            </div>

            {bookmarks.length === 0 ? (
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '80px 0', 
                    gap: '16px',
                    color: 'var(--text-muted)'
                }}>
                    <Bookmark size={48} />
                    <span>No page bookmarks saved. Add a bookmark while reading to save your spot.</span>
                </div>
            ) : (
                <div className="gallery-grid">
                    {bookmarks.map((bookmark, index) => (
                        <div 
                            key={`${bookmark.galleryId}_${bookmark.pageNumber}_${index}`} 
                            className="gallery-card"
                            onClick={() => onSelectBookmark(bookmark.galleryId, bookmark.pageNumber - 1)}
                            style={{ display: 'flex', flexDirection: 'column' }}
                        >
                            <div className="card-image-container">
                                <img src={bookmark.coverUrl} alt={bookmark.title} className="card-image" />
                                <div style={{
                                    position: 'absolute',
                                    bottom: '8px',
                                    right: '8px',
                                    background: 'var(--primary)',
                                    color: '#fff',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    <Play size={10} fill="#fff" />
                                    Page {bookmark.pageNumber}
                                </div>
                            </div>
                            <div className="card-info" style={{ padding: '10px' }}>
                                <div className="card-title" style={{ fontSize: '12px', minHeight: '34px' }} title={bookmark.title}>
                                    {bookmark.title}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                    <button 
                                        className="reader-btn" 
                                        onClick={(e) => handleDelete(bookmark, e)}
                                        style={{ padding: '4px', color: 'var(--text-muted)' }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
