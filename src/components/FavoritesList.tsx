import React, { useState, useEffect } from 'react';
import { GalleryCard } from './GalleryCard';
import { Heart, Globe, HardDrive, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface Tag {
    id: number;
    type: string;
    name: string;
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
    num_pages: number;
    num_favorites?: number;
    tags?: Tag[];
}

interface FavoritesListProps {
    onSelectGallery: (id: number) => void;
    blacklistedTags: string[];
    blacklistedTagIds: number[];
    avoidTagsBehavior: 'blur' | 'hide';
}

export const FavoritesList: React.FC<FavoritesListProps> = ({
    onSelectGallery,
    blacklistedTags,
    blacklistedTagIds,
    avoidTagsBehavior
}) => {
    const [tab, setTab] = useState<'local' | 'online'>('local');
    
    const isGalleryHidden = (g: any) => {
        if (avoidTagsBehavior !== 'hide') return false;
        const galleryTags = g.tags || [];
        const galleryTagIds = g.tag_ids || [];
        return galleryTags.some((t: any) => 
            blacklistedTags.some(bt => bt.toLowerCase().trim() === t.name.toLowerCase().trim())
        ) || galleryTagIds.some((id: number) => blacklistedTagIds.includes(id));
    };
    
    // Local Favorites states
    const [localFavorites, setLocalFavorites] = useState<Gallery[]>([]);
    const [localLoading, setLocalLoading] = useState<boolean>(true);

    // Online Favorites states
    const [onlineFavorites, setOnlineFavorites] = useState<Gallery[]>([]);
    const [onlineLoading, setOnlineLoading] = useState<boolean>(false);
    const [onlineError, setOnlineError] = useState<string | null>(null);
    const [onlinePage, setOnlinePage] = useState<number>(1);
    const [onlinePageCount, setOnlinePageCount] = useState<number>(1);
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [username, setUsername] = useState<string>('');
    const [customPageInput, setCustomPageInput] = useState<number | ''>('');
    
    useEffect(() => {
        setCustomPageInput(onlinePage);
    }, [onlinePage]);

    // Load local favorites and check login status
    const loadLocalFavs = async () => {
        setLocalLoading(true);
        try {
            const data = await (window as any).electron.getFavorites();
            setLocalFavorites(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLocalLoading(false);
        }
    };

    const checkLoginStatus = async () => {
        try {
            const settings = await (window as any).electron.getSettings();
            if (settings.sessionCookies) {
                setIsLoggedIn(true);
                setUsername(settings.username || 'User');
            } else {
                setIsLoggedIn(false);
                setUsername('');
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        loadLocalFavs();
        checkLoginStatus();
    }, []);

    // Load online favorites when tab changes to online or page changes
    useEffect(() => {
        if (tab === 'online' && isLoggedIn) {
            const loadOnlineFavs = async () => {
                setOnlineLoading(true);
                setOnlineError(null);
                try {
                    const response = await (window as any).electron.getOnlineFavorites(onlinePage);
                    if (response.success) {
                        setOnlineFavorites(response.result || []);
                        setOnlinePageCount(response.num_pages || 1);
                    } else {
                        setOnlineError(response.error || 'Failed to retrieve online favorites.');
                    }
                } catch (e: any) {
                    setOnlineError(e.message || 'An error occurred.');
                } finally {
                    setOnlineLoading(false);
                }
            };
            loadOnlineFavs();
        }
    }, [tab, onlinePage, isLoggedIn]);

    // Handle tab change
    const handleTabChange = (newTab: 'local' | 'online') => {
        setTab(newTab);
        if (newTab === 'local') {
            loadLocalFavs();
        }
        checkLoginStatus();
    };

    return (
        <div className="content-body" style={{ overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Heart size={22} fill="var(--primary)" color="var(--primary)" />
                    <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>
                        Favorites {tab === 'local' ? `(${localFavorites.length})` : ''}
                    </h2>
                </div>

                {/* Sub-tab selection */}
                <div style={{ 
                    display: 'flex', 
                    background: 'rgba(255, 255, 255, 0.05)', 
                    borderRadius: 'var(--border-radius-sm)', 
                    padding: '4px',
                    border: '1px solid var(--border-light)'
                }}>
                    <button
                        onClick={() => handleTabChange('local')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            background: tab === 'local' ? 'var(--primary)' : 'transparent',
                            color: tab === 'local' ? '#fff' : 'var(--text-secondary)',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <HardDrive size={14} />
                        Local
                    </button>
                    <button
                        onClick={() => handleTabChange('online')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: 'none',
                            background: tab === 'online' ? 'var(--primary)' : 'transparent',
                            color: tab === 'online' ? '#fff' : 'var(--text-secondary)',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Globe size={14} />
                        Online
                    </button>
                </div>
            </div>

            {/* Local Tab Content */}
            {tab === 'local' && (
                localLoading ? (
                    <div style={{ color: 'var(--text-secondary)' }}>Loading local favorites...</div>
                ) : localFavorites.length === 0 ? (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: '80px 0', 
                        gap: '16px',
                        color: 'var(--text-muted)'
                    }}>
                        <Heart size={48} />
                        <span>No local favorites. Favorite some manga to show them here.</span>
                    </div>
                ) : (
                    <div className="gallery-grid">
                        {localFavorites.filter(item => !isGalleryHidden(item)).map(item => (
                            <GalleryCard 
                                key={item.id} 
                                gallery={item} 
                                onClick={() => onSelectGallery(item.id)}
                                blacklistedTags={blacklistedTags}
                                blacklistedTagIds={blacklistedTagIds}
                                avoidTagsBehavior={avoidTagsBehavior}
                            />
                        ))}
                    </div>
                )
            )}

            {/* Online Tab Content */}
            {tab === 'online' && (
                !isLoggedIn ? (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: '60px 20px', 
                        gap: '16px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: 'var(--border-radius)',
                        border: '1px dashed var(--border-light)'
                    }}>
                        <AlertCircle size={40} color="var(--primary)" />
                        <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Online Favorites Disconnected</div>
                        <div style={{ fontSize: '13px', maxWidth: '400px', color: 'var(--text-muted)' }}>
                            Please configure and verify your manual NHentai session cookies in the Settings tab to access your online favorites.
                        </div>
                    </div>
                ) : onlineLoading ? (
                    <div style={{ color: 'var(--text-secondary)' }}>Loading online favorites from NHentai...</div>
                ) : onlineError ? (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: '60px 20px', 
                        gap: '12px',
                        color: '#e74c3c',
                        background: 'rgba(231, 76, 60, 0.05)',
                        borderRadius: 'var(--border-radius)',
                        border: '1px solid rgba(231, 76, 60, 0.15)'
                    }}>
                        <AlertCircle size={32} />
                        <div style={{ fontWeight: 'bold' }}>Failed to retrieve online favorites</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{onlineError}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                            Your cookies may be invalid or expired. Please check your cookies in Settings.
                        </div>
                    </div>
                ) : onlineFavorites.length === 0 ? (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        padding: '80px 0', 
                        gap: '16px',
                        color: 'var(--text-muted)'
                    }}>
                        <Globe size={48} />
                        <span>Logged in as <strong>{username}</strong>. No online favorites found.</span>
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Connected to NHentai profile: <strong>{username}</strong>
                        </div>
                        <div className="gallery-grid">
                            {onlineFavorites.filter(item => !isGalleryHidden(item)).map(item => (
                                <GalleryCard 
                                    key={item.id} 
                                    gallery={item} 
                                    onClick={() => onSelectGallery(item.id)}
                                    blacklistedTags={blacklistedTags}
                                    blacklistedTagIds={blacklistedTagIds}
                                    avoidTagsBehavior={avoidTagsBehavior}
                                />
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {onlinePageCount > 1 && (
                            <div className="pagination" style={{ gap: '8px', marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
                                <button 
                                    className="pagination-btn" 
                                    onClick={() => setOnlinePage(1)}
                                    disabled={onlinePage === 1}
                                    style={{ padding: '8px 12px' }}
                                >
                                    First
                                </button>
                                <button 
                                    className="pagination-btn" 
                                    onClick={() => setOnlinePage(p => Math.max(1, p - 1))}
                                    disabled={onlinePage === 1}
                                    style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                {/* Numbered page buttons */}
                                {(() => {
                                    let startPage = Math.max(1, onlinePage - 2);
                                    let endPage = Math.min(onlinePageCount, startPage + 4);
                                    if (endPage - startPage < 4) {
                                        startPage = Math.max(1, endPage - 4);
                                    }
                                    const pages = [];
                                    for (let i = startPage; i <= endPage; i++) {
                                        pages.push(i);
                                    }
                                    return pages.map(pageNum => (
                                        <button
                                            key={pageNum}
                                            className={`pagination-number ${onlinePage === pageNum ? 'active' : ''}`}
                                            onClick={() => setOnlinePage(pageNum)}
                                        >
                                            {pageNum}
                                        </button>
                                    ));
                                })()}

                                <button 
                                    className="pagination-btn" 
                                    onClick={() => setOnlinePage(p => Math.min(onlinePageCount, p + 1))}
                                    disabled={onlinePage === onlinePageCount}
                                    style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button 
                                    className="pagination-btn" 
                                    onClick={() => setOnlinePage(onlinePageCount)}
                                    disabled={onlinePage === onlinePageCount}
                                    style={{ padding: '8px 12px' }}
                                >
                                    Last
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Go to:</span>
                                    <input 
                                        type="number"
                                        min={1}
                                        max={onlinePageCount}
                                        value={customPageInput === '' ? '' : customPageInput}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setCustomPageInput(val === '' ? '' : parseInt(val, 10));
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const targetPage = Number(customPageInput);
                                                if (targetPage >= 1 && targetPage <= onlinePageCount) {
                                                    setOnlinePage(targetPage);
                                                }
                                            }
                                        }}
                                        placeholder={`${onlinePage}/${onlinePageCount}`}
                                        style={{
                                            width: '70px',
                                            background: 'var(--bg-input)',
                                            border: '1px solid var(--border-light)',
                                            borderRadius: 'var(--border-radius-sm)',
                                            color: 'var(--text-primary)',
                                            padding: '6px 8px',
                                            fontSize: '12px',
                                            outline: 'none',
                                            textAlign: 'center'
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )
            )}
        </div>
    );
};
