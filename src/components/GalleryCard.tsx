import React, { useState } from 'react';
import { BookOpen, Heart } from 'lucide-react';

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
    thumbnail?: {
        path: string;
    };
    num_pages: number;
    num_favorites?: number;
    tags?: Tag[];
    tag_ids?: number[];
    localPath?: string; // If downloaded
    offline?: boolean;
}

interface GalleryCardProps {
    gallery: Gallery;
    onClick: () => void;
    blacklistedTags: string[];
    blacklistedTagIds: number[];
    avoidTagsBehavior: 'blur' | 'hide';
}

export const GalleryCard: React.FC<GalleryCardProps> = ({
    gallery,
    onClick,
    blacklistedTags,
    blacklistedTagIds,
    avoidTagsBehavior
}) => {
    const [copied, setCopied] = useState<boolean>(false);

    const handleCopyId = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await (window as any).electron.copyToClipboard(gallery.id.toString());
        } catch (err) {
            navigator.clipboard.writeText(gallery.id.toString());
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    // Check if gallery contains any blacklisted tags (via names or tag IDs)
    const galleryTags = gallery.tags || [];
    const galleryTagIds = gallery.tag_ids || [];
    const hasBlacklistedTag = 
        galleryTags.some(t => 
            blacklistedTags.some(bt => bt.toLowerCase().trim() === t.name.toLowerCase().trim())
        ) ||
        galleryTagIds.some(id => blacklistedTagIds.includes(id));

    // If set to hide, return null
    if (hasBlacklistedTag && avoidTagsBehavior === 'hide') {
        return null;
    }

    // Determine cover URL
    let coverUrl = '';
    if (gallery.offline && gallery.localPath) {
        // Offline local file path
        const coverName = gallery.cover?.path.split('/').pop() || 'cover.webp';
        coverUrl = `file://${gallery.localPath}/${coverName}`.replace(/\\/g, '/');
    } else {
        // Online, proxy via custom protocol
        let rawPath = '';
        if (gallery.cover?.path) {
            rawPath = gallery.cover.path;
        } else if (gallery.thumbnail) {
            rawPath = typeof gallery.thumbnail === 'string' ? gallery.thumbnail : (gallery.thumbnail.path || '');
        }
        if (!rawPath) {
            rawPath = `galleries/${gallery.media_id}/cover.jpg`;
        }
        coverUrl = `nhentai-image://t1.nhentai.net/${rawPath}`;
    }

    // Safely parse titles (handles differences between search list and detail API formats)
    const titleObj = gallery.title || {};
    const englishTitle = titleObj.english || (gallery as any).english_title || '';
    const prettyTitle = titleObj.pretty || (gallery as any).pretty_title || englishTitle || 'No Title';

    // Determine language from tags
    let lang = 'unknown';
    const langTag = galleryTags.find(t => t.type === 'language');
    if (langTag) {
        lang = langTag.name;
    } else {
        const tagIds = gallery.tag_ids || [];
        if (tagIds.includes(12227)) {
            lang = 'english';
        } else if (tagIds.includes(29963)) {
            lang = 'chinese';
        } else if (tagIds.includes(6346)) {
            lang = 'japanese';
        } else if (englishTitle.toLowerCase().includes('[english]')) {
            lang = 'english';
        } else if (englishTitle.toLowerCase().includes('[japanese]')) {
            lang = 'japanese';
        } else if (englishTitle.toLowerCase().includes('[chinese]')) {
            lang = 'chinese';
        }
    }

    return (
        <div 
            className={`gallery-card ${hasBlacklistedTag ? 'blurred' : ''}`}
            onClick={onClick}
        >
            <div className="card-image-container">
                <img 
                    src={coverUrl} 
                    alt={prettyTitle} 
                    className="card-image"
                    loading="lazy"
                />
                <div 
                    className={`card-id-badge ${copied ? 'copied' : ''}`}
                    onClick={handleCopyId}
                    title="Click to copy ID"
                >
                    {copied ? '✓ Copied!' : `#${gallery.id}`}
                </div>
            </div>
            <div className="card-info">
                <div className="card-title" title={englishTitle || prettyTitle}>
                    {prettyTitle}
                </div>
                <div className="card-meta">
                    <span className="lang-badge">{lang}</span>
                    <span className="stat-item">
                        <BookOpen size={11} />
                        {gallery.num_pages}
                    </span>
                    {gallery.num_favorites !== undefined && (
                        <span className="stat-item" style={{ gap: '2px' }}>
                            <Heart size={11} fill="var(--primary)" color="var(--primary)" />
                            {gallery.num_favorites >= 1000 
                                ? (gallery.num_favorites / 1000).toFixed(1).replace(/\.0$/, '') + 'K' 
                                : gallery.num_favorites}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
