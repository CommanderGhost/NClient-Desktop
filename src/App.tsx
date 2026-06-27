import { useState, useEffect } from 'react';
import { 
  Home, 
  Heart, 
  Bookmark, 
  Download, 
  Settings as SettingsIcon, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  BookOpen,
  Info,
  X
} from 'lucide-react';
import { GalleryCard } from './components/GalleryCard';
import { GalleryDetail } from './components/GalleryDetail';
import { Reader } from './components/Reader';
import { PINLock } from './components/PINLock';
import { Settings } from './components/Settings';
import { FavoritesList } from './components/FavoritesList';
import { BookmarksList } from './components/BookmarksList';
import { DownloadsManager } from './components/DownloadsManager';
import { Toast } from './components/Toast';
import { ConfirmationModal } from './components/ConfirmationModal';

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
  pages: any[];
}

const COMMON_TAG_IDS: { [name: string]: number } = {
  "sole female": 35762,
  "sole male": 35763,
  "group": 8010,
  "stockings": 24201,
  "anal": 14283,
  "translated": 17249,
  "schoolgirl uniform": 10314,
  "nakadashi": 13720,
  "blowjob": 29859,
  "full color": 20905,
  "imouto": 19440,
  "milf": 1207,
  "rape": 27553,
  "schoolgirl": 2515,
  "lolicon": 19440,
  "bondage": 15658,
  "dilf": 718,
  "shotacon": 32341,
  "x-ray": 20035,
  "yaoi": 23895,
  "paizuri": 25614,
  "shota": 32341,
  "incest": 22942,
  "defloration": 20525,
  "futanari": 779,
  "crossdressing": 15782,
  "dark skin": 19018,
  "cheating": 9253,
  "swimsuit": 3735,
  "double penetration": 22945,
  "mind control": 20617,
  "netorare": 8653,
  "harem": 15785,
  "glasses": 8378,
  "bunny girl": 23132,
  "catgirl": 31386,
  "tentacles": 31775,
  "monster": 18580,
  "demon": 16228,
  "succubus": 16228,
  "elf": 832,
  "furry": 31386,
  "pregnant": 6343,
  "handjob": 1033,
  "footjob": 20282,
  "masturbation": 9162,
  "lactation": 24102,
  "bikini": 19175,
  "lingerie": 25871,
  "nurse": 8516,
  "maid": 190,
  "yuri": 16533,
  "tomboy": 29366,
  "garter belt": 9514,
  "pantyhose": 24380,
  "kneesocks": 105844,
  "high heels": 105824,
  "monochrome": 21572,
  "uncensored": 8693,
  "censored": 8368,
  "femdom": 15408,
  "submissive": 15408,
  "dominant": 15408,
  "bdsm": 15658,
  "spanking": 14971,
  "whipping": 14971,
  "crying": 20380,
  "sweating": 1590,
  "blushing": 20380,
  "armpits": 10988,
  "navel": 10988,
  "huge breasts": 14072,
  "big breasts": 2937,
  "flat chest": 25000,
  "small breasts": 25601,
  "old man": 24208,
  "ugly bastard": 29013,
  "mind break": 27384,
  "drugs": 22079,
  "sleeping": 16533,
  "drunk": 16533,
  "blackmail": 20617,
  "corruption": 20617,
  "hypnosis": 20617,
  "body swap": 30035,
  "gender bender": 30035,
  "guro": 27217,
  "scat": 2820,
  "peeing": 10476,
  "urination": 10476,
  "enema": 9406,
  "panties": 2184,
};

const resolveTagIds = async (tags: string[]) => {
  const ids: number[] = [];
  try {
    const settings = await (window as any).electron.getSettings();
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim();
      
      // 1. Check local dictionary first
      if (COMMON_TAG_IDS[normalized]) {
        ids.push(COMMON_TAG_IDS[normalized]);
        continue;
      }
      
      // 2. Query mirror API
      try {
        const types = ['tag', 'artist', 'category', 'character', 'group', 'language', 'parody'];
        let resolvedId: number | null = null;
        
        for (const type of types) {
          const response = await (window as any).electron.fetchApi(
            `https://${settings.mirror}/api/v2/tags/${type}?query=${encodeURIComponent(normalized)}`
          );
          if (response.success && response.data && Array.isArray(response.data.result)) {
            const match = response.data.result.find(
              (r: any) => r.name.toLowerCase().trim() === normalized
            );
            if (match) {
              resolvedId = match.id;
              break;
            }
          }
        }
        
        if (resolvedId !== null) {
          ids.push(resolvedId);
        }
      } catch (e) {
        console.error(`Failed to resolve ID for tag: ${tag}`, e);
      }
    }
  } catch (e) {
    console.error('Failed to resolve tags settings:', e);
  }
  return ids;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites' | 'bookmarks' | 'downloads' | 'settings'>('home');
  const [selectedGalleryId, setSelectedGalleryId] = useState<number | null>(null);
  const [lastViewedGalleryId, setLastViewedGalleryId] = useState<number | null>(null);
  const [readerGallery, setReaderGallery] = useState<any | null>(null);
  const [readerInitialPage, setReaderInitialPage] = useState<number>(0);
  
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageCount, setPageCount] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [popularNow, setPopularNow] = useState<Gallery[]>([]);
  const [customPageInput, setCustomPageInput] = useState<number | ''>('');
  
  // Settings states
  const [blacklistedTags, setBlacklistedTags] = useState<string[]>([]);
  const [blacklistedTagIds, setBlacklistedTagIds] = useState<number[]>([]);
  const [avoidTagsBehavior, setAvoidTagsBehavior] = useState<'blur' | 'hide'>('blur');
  const [appLocked, setAppLocked] = useState<boolean>(false);
  const [pinHash, setPinHash] = useState<string>('');
  const [lockType, setLockType] = useState<'pin' | 'password'>('pin');
  const [, setTheme] = useState<'dark' | 'darkblue' | 'warmyellow' | 'darkpurple'>('dark');
  interface ToastItem {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    details?: { id: number | string; title: string };
  }

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showChangelog, setShowChangelog] = useState<boolean>(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    visible: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({ title: '', message: '', visible: false });

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    details?: { id: number | string; title: string }
  ) => {
    const newToast: ToastItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      message,
      type,
      details
    };
    setToasts(prev => [...prev, newToast]);
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setConfirmConfig({
      title,
      message,
      visible: true,
      onConfirm: () => {
        onConfirm();
        setConfirmConfig(prev => ({ ...prev, visible: false }));
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setConfirmConfig(prev => ({ ...prev, visible: false }));
      }
    });
  };

  useEffect(() => {
    (window as any).showToast = showToast;
    (window as any).showConfirm = showConfirm;
  }, []);

  useEffect(() => {
    setCustomPageInput(page);
  }, [page]);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await (window as any).electron.getSettings();
        setBlacklistedTags(data.blacklistedTags || []);
        setAvoidTagsBehavior(data.avoidTagsBehavior || 'blur');
        setPinHash(data.pinHash || '');
        setLockType(data.lockType || 'pin');
        
        let themeVal = data.theme || 'dark';
        if (themeVal === 'light' || themeVal === 'amoled') {
          themeVal = 'dark';
        }
        setTheme(themeVal);
        applyThemeClass(themeVal);

        if (data.pinEnabled && data.pinHash) {
          setAppLocked(true);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchSettings();
  }, []);

  // Resolve tag names to IDs whenever blacklist updates
  useEffect(() => {
    const resolve = async () => {
      if (blacklistedTags.length === 0) {
        setBlacklistedTagIds([]);
        return;
      }
      const ids = await resolveTagIds(blacklistedTags);
      setBlacklistedTagIds(ids);
    };
    resolve();
  }, [blacklistedTags]);

  // Synchronize settings changes on tab switches (e.g. going from settings page back to main page)
  useEffect(() => {
    const syncSettings = async () => {
      try {
        const data = await (window as any).electron.getSettings();
        setBlacklistedTags(data.blacklistedTags || []);
        setAvoidTagsBehavior(data.avoidTagsBehavior || 'blur');
        setLockType(data.lockType || 'pin');
        
        let themeVal = data.theme || 'dark';
        if (themeVal === 'light' || themeVal === 'amoled') {
          themeVal = 'dark';
        }
        setTheme(themeVal);
        applyThemeClass(themeVal);
      } catch (e) {
        console.error('Failed to sync settings on tab change:', e);
      }
    };
    syncSettings();
  }, [activeTab]);

  const applyThemeClass = (selectedTheme: 'dark' | 'darkblue' | 'warmyellow' | 'darkpurple') => {
    document.body.classList.remove('theme-darkblue', 'theme-warmyellow', 'theme-darkpurple');
    if (selectedTheme === 'darkblue') {
      document.body.classList.add('theme-darkblue');
    } else if (selectedTheme === 'warmyellow') {
      document.body.classList.add('theme-warmyellow');
    } else if (selectedTheme === 'darkpurple') {
      document.body.classList.add('theme-darkpurple');
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'darkblue' | 'warmyellow' | 'darkpurple') => {
    setTheme(newTheme);
    applyThemeClass(newTheme);
  };


  // Fetch galleries from API (supports main page & searches)
  const fetchGalleries = async (currentPage: number, query: string) => {
    setLoading(true);
    try {
      const settings = await (window as any).electron.getSettings();
      let apiUrl = `https://${settings.mirror}/api/v2/galleries?page=${currentPage}`;
      
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        if (/^\d+$/.test(trimmedQuery)) {
          // If query is a numeric ID, fetch that specific gallery directly
          apiUrl = `https://${settings.mirror}/api/v2/galleries/${trimmedQuery}`;
          const response = await (window as any).electron.fetchApi(apiUrl);
          if (response.success && response.data) {
            setGalleries([response.data]);
            setPageCount(1);
          } else {
            setGalleries([]);
            setPageCount(1);
          }
          return;
        } else {
          apiUrl = `https://${settings.mirror}/api/v2/search?query=${encodeURIComponent(trimmedQuery)}&page=${currentPage}`;
        }
      }

      const response = await (window as any).electron.fetchApi(apiUrl);
      if (response.success && response.data) {
        setGalleries(response.data.result || []);
        setPageCount(response.data.num_pages || 1);
      } else {
        setGalleries([]);
        setPageCount(1);
      }
    } catch (e) {
      console.error(e);
      setGalleries([]);
      setPageCount(1);
    } finally {
      setLoading(false);
    }
  };

  const fetchPopular = async () => {
    try {
      const settings = await (window as any).electron.getSettings();
      const apiUrl = `https://${settings.mirror}/api/v2/galleries/popular`;
      const response = await (window as any).electron.fetchApi(apiUrl);
      if (response.success && response.data) {
        const rawData = response.data;
        const items = Array.isArray(rawData) ? rawData : Object.values(rawData);
        setPopularNow(items as Gallery[]);
      } else {
        setPopularNow([]);
      }
    } catch (e) {
      console.error("Failed to fetch popular now:", e);
      setPopularNow([]);
    }
  };

  // Trigger load on page or query change
  useEffect(() => {
    if (activeTab === 'home') {
      fetchGalleries(page, searchQuery);
    }
  }, [page, searchQuery, activeTab]);

  // Trigger popular now fetch
  useEffect(() => {
    if (activeTab === 'home' && page === 1 && !searchQuery.trim()) {
      fetchPopular();
    }
  }, [activeTab, page, searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1); // reset to page 1
  };

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmedQuery = searchQuery.trim();
      if (/^\d+$/.test(trimmedQuery)) {
        e.preventDefault();
        setLoading(true);
        try {
          const settings = await (window as any).electron.getSettings();
          const apiUrl = `https://${settings.mirror}/api/v2/galleries/${trimmedQuery}`;
          const response = await (window as any).electron.fetchApi(apiUrl);
          if (response.success && response.data) {
            setSelectedGalleryId(response.data.id);
            setSearchQuery(''); // Clear search query to reset the main page list
          } else {
            showToast('Doujin ID not found.', 'error');
          }
        } catch (err: any) {
          console.error(err);
          showToast('Failed to fetch doujin ID.', 'error');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleBookmarkSelect = async (galleryId: number, pageIndex: number) => {
    try {
      setLoading(true);
      // Load details first
      const settings = await (window as any).electron.getSettings();
      
      // Check offline downloads first
      const downloads = await (window as any).electron.getDownloads();
      const localItem = downloads.find((d: any) => d.id === galleryId);
      
      let galleryData = null;
      if (localItem && localItem.status === 'completed') {
        const response = await fetch(`file://${localItem.localPath}/metadata.json`.replace(/\\/g, '/'));
        galleryData = await response.json();
        galleryData.localPath = localItem.localPath;
        galleryData.offline = true;
      } else {
        const response = await (window as any).electron.fetchApi(
          `https://${settings.mirror}/api/v2/galleries/${galleryId}`
        );
        if (response.success) {
          galleryData = response.data;
        }
      }

      if (galleryData) {
        setReaderInitialPage(pageIndex);
        setReaderGallery(galleryData);
      } else {
        showToast('Failed to load bookmarked manga.', 'error', {
          id: galleryId,
          title: 'Bookmark'
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isGalleryHidden = (g: any) => {
    if (avoidTagsBehavior !== 'hide') return false;
    const galleryTags = g.tags || [];
    const galleryTagIds = g.tag_ids || [];
    return galleryTags.some((t: any) => 
      blacklistedTags.some(bt => bt.toLowerCase().trim() === t.name.toLowerCase().trim())
    ) || galleryTagIds.some((id: number) => blacklistedTagIds.includes(id));
  };

  const handleTagClick = (tagName: string) => {
    setLastViewedGalleryId(selectedGalleryId);
    setSearchQuery(tagName);
    setPage(1);
    setSelectedGalleryId(null); // close detail
    setActiveTab('home');
  };

  // If locked, render PIN/Password entry screen
  if (appLocked) {
    return (
      <PINLock 
        correctPinHash={pinHash}
        mode="unlock"
        lockType={lockType}
        onSuccess={() => setAppLocked(false)}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <nav className="sidebar">
        <div className="logo-container">
          <BookOpen className="logo-icon" size={24} />
          <span className="logo-text">Nhentai Desktop</span>
        </div>

        <div className="nav-links">
          <div 
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => { setActiveTab('home'); setSelectedGalleryId(null); }}
          >
            <Home size={18} />
            <span>Main Page</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => { setActiveTab('favorites'); setSelectedGalleryId(null); }}
          >
            <Heart size={18} />
            <span>Favorites</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'bookmarks' ? 'active' : ''}`}
            onClick={() => { setActiveTab('bookmarks'); setSelectedGalleryId(null); }}
          >
            <Bookmark size={18} />
            <span>Bookmarks</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'downloads' ? 'active' : ''}`}
            onClick={() => { setActiveTab('downloads'); setSelectedGalleryId(null); }}
          >
            <Download size={18} />
            <span>Offline Library</span>
          </div>

          <div 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setSelectedGalleryId(null); }}
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </div>
        </div>

        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>Client Version</span>
            <span>v1.2</span>
          </div>
          <button 
            className="changelog-btn"
            onClick={() => setShowChangelog(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--border-radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '11px',
              padding: '6px 12px',
              cursor: 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              marginTop: '4px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border-light)';
            }}
          >
            <Info size={12} />
            View Changelog
          </button>
        </div>
      </nav>

      {/* Main Display Body */}
      <main className="main-content">
        {/* Header HUD */}
        {activeTab === 'home' && (
          <header className="main-header">
            <span className="header-title">Browse Galleries</span>
            
            <div className="search-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lastViewedGalleryId !== null && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setSelectedGalleryId(lastViewedGalleryId);
                    setLastViewedGalleryId(null);
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--border-radius-sm)',
                    cursor: 'pointer'
                  }}
                >
                  <ChevronLeft size={14} />
                  Back to Doujin
                </button>
              )}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                <Search className="search-icon" size={16} />
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Search by title, artist, tag..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  style={{ paddingLeft: '32px', width: '100%' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setPage(1);
                      setLastViewedGalleryId(null);
                    }}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Tab Router Switch */}
        {activeTab === 'home' && (
          <div className="content-body fade-slide-up" style={{ overflowY: 'auto' }}>
            {loading ? (
              <div className="gallery-grid skeleton-pulse" style={{ width: '100%' }}>
                {Array.from({ length: 12 }).map((_, idx) => (
                  <div key={`skel-${idx}`} className="skeleton-card">
                    <div className="skeleton-img" />
                    <div className="skeleton-info">
                      <div className="skeleton-line title" />
                      <div className="skeleton-line meta" />
                    </div>
                  </div>
                ))}
              </div>
            ) : galleries.length === 0 ? (
              <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                No galleries found.
              </div>
            ) : (
              <>
                {/* Popular Now Section */}
                {page === 1 && !searchQuery.trim() && popularNow.length > 0 && (
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-primary)', letterSpacing: '1px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '4px', height: '16px', backgroundColor: 'var(--primary)', borderRadius: '2px' }}></span>
                      Popular Now
                    </div>
                    <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '12px' }}>
                      {popularNow.filter(g => !isGalleryHidden(g)).map(g => (
                        <div key={`pop-${g.id}`} style={{ width: '180px', flexShrink: 0 }}>
                          <GalleryCard 
                            gallery={g} 
                            onClick={() => setSelectedGalleryId(g.id)}
                            blacklistedTags={blacklistedTags}
                            blacklistedTagIds={blacklistedTagIds}
                            avoidTagsBehavior={avoidTagsBehavior}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {page === 1 && !searchQuery.trim() && (
                  <div style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-primary)', letterSpacing: '1px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '4px', height: '16px', backgroundColor: 'var(--text-secondary)', borderRadius: '2px' }}></span>
                    Recent Uploads
                  </div>
                )}

                <div className="gallery-grid">
                  {galleries.filter(g => !isGalleryHidden(g)).map(g => (
                    <GalleryCard 
                      key={g.id} 
                      gallery={g} 
                      onClick={() => setSelectedGalleryId(g.id)}
                      blacklistedTags={blacklistedTags}
                      blacklistedTagIds={blacklistedTagIds}
                      avoidTagsBehavior={avoidTagsBehavior}
                    />
                  ))}
                </div>

                {/* Pagination HUD */}
                {pageCount > 1 && (
                  <div className="pagination" style={{ gap: '8px', marginTop: '24px' }}>
                    <button 
                      className="pagination-btn" 
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      style={{ padding: '8px 12px' }}
                    >
                      First
                    </button>
                    <button 
                      className="pagination-btn" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      style={{ padding: '8px 12px' }}
                    >
                      <ChevronLeft size={16} />
                    </button>

                    {/* Numbered page buttons */}
                    {(() => {
                      let startPage = Math.max(1, page - 2);
                      let endPage = Math.min(pageCount, startPage + 4);
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
                          className={`pagination-number ${page === pageNum ? 'active' : ''}`}
                          onClick={() => setPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      ));
                    })()}

                    <button 
                      className="pagination-btn" 
                      onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                      disabled={page === pageCount}
                      style={{ padding: '8px 12px' }}
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button 
                      className="pagination-btn" 
                      onClick={() => setPage(pageCount)}
                      disabled={page === pageCount}
                      style={{ padding: '8px 12px' }}
                    >
                      Last
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Go to:</span>
                      <input 
                        type="number"
                        min={1}
                        max={pageCount}
                        value={customPageInput === '' ? '' : customPageInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomPageInput(val === '' ? '' : parseInt(val, 10));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const targetPage = Number(customPageInput);
                            if (targetPage >= 1 && targetPage <= pageCount) {
                              setPage(targetPage);
                            }
                          }
                        }}
                        placeholder={`${page}/${pageCount}`}
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
            )}
          </div>
        )}

        {activeTab === 'favorites' && (
          <div className="fade-slide-up" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
            <FavoritesList 
              onSelectGallery={(id) => setSelectedGalleryId(id)}
              blacklistedTags={blacklistedTags}
              blacklistedTagIds={blacklistedTagIds}
              avoidTagsBehavior={avoidTagsBehavior}
            />
          </div>
        )}

        {activeTab === 'bookmarks' && (
          <div className="fade-slide-up" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
            <BookmarksList 
              onSelectBookmark={handleBookmarkSelect}
            />
          </div>
        )}

        {activeTab === 'downloads' && (
          <div className="fade-slide-up" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
            <DownloadsManager 
              onSelectGallery={(id) => setSelectedGalleryId(id)}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="fade-slide-up" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
            <Settings 
              onThemeChange={handleThemeChange}
            />
          </div>
        )}

        {/* Gallery Detail Overlay */}
        {selectedGalleryId !== null && (
          <GalleryDetail 
            galleryId={selectedGalleryId}
            onBack={() => setSelectedGalleryId(null)}
            onRead={(gallery, pageIndex = 0) => {
              setReaderInitialPage(pageIndex);
              setReaderGallery(gallery);
            }}
            blacklistedTags={blacklistedTags}
            onTagClick={handleTagClick}
          />
        )}

        {/* Reader Overlay */}
        {readerGallery !== null && (
          <Reader 
            gallery={readerGallery}
            initialPageIndex={readerInitialPage}
            onClose={() => setReaderGallery(null)}
          />
        )}

        {/* Toast Notifications Stack */}
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          {toasts.map(t => (
            <Toast 
              key={t.id}
              message={t.message} 
              type={t.type} 
              details={t.details}
              onClose={() => setToasts(prev => prev.filter(item => item.id !== t.id))} 
            />
          ))}
        </div>

        {/* Global Confirmation Modal */}
        {confirmConfig.visible && (
          <ConfirmationModal 
            title={confirmConfig.title} 
            message={confirmConfig.message} 
            onConfirm={confirmConfig.onConfirm!} 
            onCancel={confirmConfig.onCancel!} 
          />
        )}

        {/* Changelog Modal */}
        {showChangelog && (
          <div className="modal-overlay" onClick={() => setShowChangelog(false)}>
            <div 
              className="confirm-modal-box" 
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '450px',
                maxWidth: '95%',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Version v1.2 Changelog
                </h3>
                <button 
                  onClick={() => setShowChangelog(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    borderRadius: '50%',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  <X size={18} />
                </button>
              </div>

              <div 
                className="modal-body" 
                style={{ 
                  color: 'var(--text-secondary)', 
                  fontSize: '13px', 
                  lineHeight: '1.6', 
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  paddingRight: '4px'
                }}
              >
                {/* VERSION 1.2 NEW FEATURES */}
                <div style={{ paddingBottom: '6px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '13px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginBottom: '8px' }}>
                    🆕 NEW IN VERSION v1.2
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '2px' }}>
                        1. Hydrated Metadata for Online Favorites
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        Online favorites are dynamically hydrated using nHentai's public JSON API. Renders real page counts, total favorites, tags, and languages on catalog cards.
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border-light)', margin: '4px 0' }}></div>

                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '2px' }}>
                        2. Sliding Window Lazy Loading in Reader
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        Memory-efficient image loader for Webtoon mode restricts the active DOM to a maximum of 5 concurrent pages, eliminating lag and reducing RAM footprint.
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border-light)', margin: '4px 0' }}></div>

                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '2px' }}>
                        3. Self-Healing Folder Deletion Verification
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        Detects if a downloaded manga folder was deleted outside the app via Windows Explorer. Sets card status to Failed, blocking detail page crashes with custom warning toasts.
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border-light)', margin: '4px 0' }}></div>

                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '2px' }}>
                        4. Interactive Bulk Actions & Progressive Loader
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        Batch Download All, Pause, Cancel, Delete, and PDF Export options. PDF exports include a live rotating progress tracker directly on the button UI.
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border-light)', margin: '4px 0' }}></div>

                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '2px' }}>
                        5. UI Typography & Sticky Header Actions
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        Unified Settings input preview fonts with sans-serif styles, changed failed badge text colors to glowing red, and implemented sticky back-routing detail navigation buttons.
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '2px double var(--border-light)', margin: '4px 0' }}></div>

                <div style={{ fontWeight: 800, color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' }}>
                  ⏳ PREVIOUS IN VERSION v1.1
                </div>

                <div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                    1. Pause & Cancel Downloads
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    Full control over active downloads. Pause downloading without corrupting progress, or Cancel to stop queue execution while keeping the manga card in your offline library (status set to failed/retry).
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)' }}></div>

                <div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                    2. Multi-Toast Stack Notification
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    Custom toast notifications now stack vertically at the top-right corner. Features contextual doujin metadata (ID & Title) and smooth slide-out fade-out CSS transitions.
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)' }}></div>

                <div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                    3. Viewport-Centered Confirmation Modal
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    Confirmation boxes for session logout and manga deletion are rendered at the root window level, correcting translation/centering issues caused by parent layout transformations.
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)' }}></div>

                <div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                    4. DNS Bypass for Profile & Online Favorites
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    Online favorites fetches and profile credentials verification are routed through secure DNS-over-HTTPS (DoH) requests to bypass ISP censorship blocks.
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)' }}></div>

                <div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                    5. Resilient Account Session Login
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    Browser login popup automatically saves extracted cookies and profile details directly to settings on background API check failures due to Cloudflare verification bounds.
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)' }}></div>

                <div>
                  <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                    6. Input Settings Customization (Speed Limit & Queue)
                  </div>
                  <div style={{ fontSize: '12px' }}>
                    Enables raw numeric inputs to adjust download speed limits (in KB/s) and maximum concurrent queue downloads in settings.
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button 
                  className="btn-primary" 
                  onClick={() => setShowChangelog(false)}
                  style={{ padding: '8px 20px', fontSize: '12px' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
