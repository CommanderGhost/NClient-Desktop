import React, { useState, useEffect } from 'react';
import { PINLock } from './PINLock';
import { Shield, Plus, Trash2 } from 'lucide-react';

interface SettingsData {
    mirror: string;
    apiKey: string;
    pinEnabled: boolean;
    pinHash: string;
    lockType?: 'pin' | 'password';
    blacklistedTags: string[];
    avoidTagsBehavior: 'blur' | 'hide';
    downloadPath: string;
    theme?: 'dark' | 'darkblue' | 'warmyellow' | 'darkpurple';
    sessionCookies?: string;
    username?: string;
    userId?: string;
    favoritesCount?: number;
    downloadSpeedLimit?: number;
    maxConcurrentDownloads?: number;
    pdfSaveDir?: string;
}

const POPULAR_TAGS = [
    // Common / High-Frequency tags
    "sole female", "sole male", "group", "stockings", "anal", "translated", "schoolgirl uniform", 
    "nakadashi", "blowjob", "full color", "imouto", "milf", "rape", "schoolgirl", "lolicon", 
    "bondage", "dilf", "shotacon", "x-ray", "yaoi", "paizuri", "shota", "incest", "defloration", 
    "futanari", "crossdressing", "dark skin", "cheating", "swimsuit", "double penetration", 
    "mind control", "netorare", "harem", "glasses", "bunny girl", "catgirl", "tentacles", 
    "monster", "demon", "succubus", "elf", "furry", "pregnant", "handjob", "footjob", 
    "masturbation", "lactation", "bikini", "lingerie", "nurse", "maid", "yuri", "tomboy", 
    "garter belt", "pantyhose", "kneesocks", "high heels", "monochrome", "uncensored", 
    "censored", "femdom", "submissive", "dominant", "bdsm", "spanking", "whipping", 
    "crying", "sweating", "blushing", "armpits", "navel", "huge breasts", "big breasts", "flat chest", 
    "small breasts", "panties", "old man", "ugly bastard", "mind break", "drugs", "sleeping", 
    "drunk", "blackmail", "corruption", "hypnosis", "body swap", "gender bender", 
    "futa on female", "futa on futa", "guro", "scat", "peeing", "urination", "enema", 
    "cousin", "stepmother", "stepsister", "stepbrother", "stepfather", "office lady", 
    "gyaru", "cosplay", "virginity", "first time", "romance", "schoolboy", "bloomers", 
    "apron", "naked apron", "ryona", "pegging", "bestiality", "dog", "cat", "slime", 
    "cum inflation", "stomach deformation", "pregnancy", "birth", "egg laying", 
    "internal view", "exhibitionism", "voyeurism", "cuckold", "ntr", "hairy armpits", 
    "piercing", "tattoo", "body writing", "collar", "leash", "gag", "blindfold", 
    "cuffs", "chains", "dildo", "vibrator", "anal bead", "fisting", "prolapse", 
    "gokkun", "bukkake", "facial", "deepthroat", "breast feed", "breast expansion", 
    "dick growth", "female on male", "male on male", "females only", "males only",
    // Parodies & Themes
    "original", "kantai collection", "touhou project", "fate grand order", "idolmaster", 
    "vocaloid", "granblue fantasy", "azur lane", "genshin impact", "love live", 
    "neon genesis evangelion", "sword art online", "naruto", "one piece", "dragon ball", 
    "sailor moon", "pokemon", "cardcaptor sakura", "detective conan", "fairy tail", 
    "my hero academia", "demon slayer", "jujutsu kaisen", "chainsaw man", "hololive"
];

interface SettingsProps {
    onThemeChange: (theme: 'dark' | 'darkblue' | 'warmyellow' | 'darkpurple') => void;
}

export const Settings: React.FC<SettingsProps> = ({ onThemeChange }) => {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [newTag, setNewTag] = useState<string>('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [focused, setFocused] = useState<boolean>(false);
    const [pinMode, setPinMode] = useState<'none' | 'setup' | 'disable'>('none');
    const [verifying, setVerifying] = useState<boolean>(false);
    const [confirmReset, setConfirmReset] = useState<boolean>(false);
    const [isResetting, setIsResetting] = useState<boolean>(false);

    useEffect(() => {
        const loadSettings = async () => {
            const data = await (window as any).electron.getSettings();
            setSettings(data);
        };
        loadSettings();
    }, []);

    useEffect(() => {
        const query = newTag.trim().toLowerCase();
        if (!query) {
            setSuggestions([]);
            return;
        }

        const filtered = POPULAR_TAGS.filter(tag => 
            tag.toLowerCase().includes(query) && 
            !settings?.blacklistedTags.some(bt => bt.toLowerCase() === tag.toLowerCase())
        ).slice(0, 5);

        setSuggestions(filtered);
    }, [newTag, settings?.blacklistedTags]);

    const handleSave = async (updated: SettingsData) => {
        setSettings(updated);
        await (window as any).electron.saveSettings(updated);
        if (updated.theme) {
            onThemeChange(updated.theme);
        }
    };

    const handleSelectChange = (key: keyof SettingsData, val: any) => {
        if (!settings) return;
        handleSave({ ...settings, [key]: val });
    };

    const handleToggleChange = (key: keyof SettingsData, checked: boolean) => {
        if (!settings) return;
        
        // If enabling PIN, trigger setup
        if (key === 'pinEnabled') {
            if (checked) {
                setPinMode('setup');
            } else {
                setPinMode('disable');
            }
            return;
        }

        handleSave({ ...settings, [key]: checked });
    };

    const handleAddBlacklist = (tagToAdd?: string) => {
        if (!settings) return;
        const tag = (tagToAdd || newTag).trim();
        if (!tag) return;
        const exists = settings.blacklistedTags.some(t => t.toLowerCase() === tag.toLowerCase());
        if (exists) return;

        const updatedList = [...settings.blacklistedTags, tag];
        handleSave({ ...settings, blacklistedTags: updatedList });
        setNewTag('');
    };

    const handleRemoveBlacklist = (tag: string) => {
        if (!settings) return;
        const updatedList = settings.blacklistedTags.filter(t => t !== tag);
        handleSave({ ...settings, blacklistedTags: updatedList });
    };

    if (!settings) {
        return <div style={{ color: 'var(--text-secondary)' }}>Loading settings...</div>;
    }

    return (
        <div className="content-body" style={{ overflowY: 'auto' }}>
            <div className="settings-section">
                <div className="settings-section-title">NHentai Account Session</div>
                
                {settings.sessionCookies ? (
                    <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                        <div className="setting-label-block">
                            <div className="setting-title" style={{ color: '#2ecc71', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="status-dot-green"></span>
                                Connected as {settings.username || 'User'}
                            </div>
                            <div className="setting-desc" style={{ marginTop: '4px' }}>
                                <strong>User ID:</strong> {settings.userId || 'Unknown'} | <strong>Total Online Favorites:</strong> {settings.favoritesCount || 0}
                            </div>
                        </div>
                        
                        <button 
                            className="btn-secondary" 
                            onClick={() => {
                                (window as any).showConfirm(
                                    'Confirm Log Out',
                                    'Are you sure you want to clear this session and log out?',
                                    async () => {
                                        await (window as any).electron.logoutNhentai();
                                        const data = await (window as any).electron.getSettings();
                                        setSettings(data);
                                    }
                                );
                            }}
                            style={{ alignSelf: 'flex-start', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                        >
                            Log Out / Disconnect
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Option 1: Automatic Login */}
                        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                            <div className="setting-label-block">
                                <div className="setting-title">Option 1: Log In via Browser (Recommended)</div>
                                <div className="setting-desc">Opens an automated browser window. Log in to your NHentai account and solve Turnstile. The window will close automatically upon successful login.</div>
                            </div>
                            <button 
                                className="btn-primary"
                                onClick={async () => {
                                    setVerifying(true);
                                    try {
                                        const res = await (window as any).electron.loginNhentai();
                                        if (res.success) {
                                            const data = await (window as any).electron.getSettings();
                                            setSettings(data);
                                            (window as any).showToast(`Logged in successfully as ${res.username || 'User'}!`, 'success');
                                        } else if (res.error !== 'Window closed') {
                                            (window as any).showToast('Login failed: ' + res.error, 'error');
                                        }
                                    } catch (e: any) {
                                        (window as any).showToast('Error during login: ' + e.message, 'error');
                                    } finally {
                                        setVerifying(false);
                                    }
                                }}
                                style={{ alignSelf: 'flex-start', padding: '10px 24px' }}
                                disabled={verifying}
                            >
                                {verifying ? 'Waiting for login...' : 'Open Login Window'}
                            </button>
                        </div>

                        {/* Divider */}
                        <div style={{ borderTop: '1px dashed var(--border-light)', margin: '10px 0' }}></div>

                        {/* Option 2: Manual Cookie Login */}
                        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                            <div className="setting-label-block">
                                <div className="setting-title">Option 2: Manual Cookie Login (Fallback)</div>
                                <div className="setting-desc">If the browser window fails, paste your raw cookies string here manually:</div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                <textarea 
                                    className="setting-input" 
                                    placeholder="Paste raw cookies string (e.g. sessionid=...; csrftoken=...)"
                                    id="manual-sessionid-input"
                                    rows={3}
                                    style={{ width: '100%', height: '80px', fontSize: '13px', resize: 'vertical' }}
                                    disabled={verifying}
                                  />
                                <button 
                                    className="btn-secondary"
                                    onClick={async () => {
                                        const input = document.getElementById('manual-sessionid-input') as HTMLTextAreaElement;
                                        const val = input ? input.value.trim() : '';
                                        if (!val) {
                                            (window as any).showToast('Please enter your cookies.', 'info');
                                            return;
                                        }
                                        setVerifying(true);
                                        try {
                                            const res = await (window as any).electron.verifyNhentaiSession(val);
                                            if (res.success) {
                                                const data = await (window as any).electron.getSettings();
                                                setSettings(data);
                                                (window as any).showToast(`Session verified successfully! Logged in as ${res.username}.`, 'success');
                                            } else {
                                                (window as any).showToast(`Verification failed: ${res.error}`, 'error');
                                            }
                                        } catch (e: any) {
                                            (window as any).showToast(`Error verifying cookies: ${e.message}`, 'error');
                                        } finally {
                                            setVerifying(false);
                                        }
                                    }}
                                    style={{ alignSelf: 'flex-start', padding: '10px 24px' }}
                                    disabled={verifying}
                                >
                                    {verifying ? 'Verifying Session...' : 'Verify & Save Session'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Appearance & Aesthetics</div>
                
                <div className="setting-row">
                    <div className="setting-label-block">
                        <div className="setting-title">Aesthetics Theme</div>
                        <div className="setting-desc">Color accents palette design of the interface</div>
                    </div>
                    <select 
                        className="setting-input"
                        value={settings.theme || 'dark'}
                        onChange={(e) => handleSelectChange('theme', e.target.value)}
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="dark">Obsidian Dark (Recommended)</option>
                        <option value="darkblue">Deep Ocean Blue</option>
                        <option value="warmyellow">Warm Cozy Dark</option>
                        <option value="darkpurple">Discord Dark Purple</option>
                    </select>
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Security Lock</div>

                <div className="setting-row">
                    <div className="setting-label-block">
                        <div className="setting-title">Lock Type</div>
                        <div className="setting-desc">Choose between a 4-digit numeric PIN or text Password</div>
                    </div>
                    <select
                        className="setting-input"
                        value={settings.lockType || 'pin'}
                        onChange={(e) => handleSelectChange('lockType', e.target.value)}
                        disabled={settings.pinEnabled}
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="pin">PIN (4-Digit)</option>
                        <option value="password">Password</option>
                    </select>
                </div>

                <div className="setting-row">
                    <div className="setting-label-block">
                        <div className="setting-title">Enable Startup Lock</div>
                        <div className="setting-desc">Locks application access on startup with selected code/password</div>
                    </div>
                    <label className="switch">
                        <input 
                            type="checkbox" 
                            checked={settings.pinEnabled}
                            onChange={(e) => handleToggleChange('pinEnabled', e.target.checked)}
                        />
                        <span className="slider"></span>
                    </label>
                </div>

                {settings.pinEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2ecc71', fontSize: '13px', fontWeight: 'bold' }}>
                        <Shield size={16} />
                        <span>
                            {settings.lockType === 'password' ? 'Password' : 'PIN'} is active (
                            {settings.lockType === 'password' ? '•'.repeat(settings.pinHash.length) : settings.pinHash}
                            )
                        </span>
                    </div>
                )}
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Tag Blacklist Filter</div>

                <div className="setting-row">
                    <div className="setting-label-block">
                        <div className="setting-title">Avoided Tags Filter Mode</div>
                        <div className="setting-desc">Blur covers and titles vs hiding them completely</div>
                    </div>
                    <select 
                        className="setting-input"
                        value={settings.avoidTagsBehavior}
                        onChange={(e) => handleSelectChange('avoidTagsBehavior', e.target.value)}
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="blur">Blur doujin cover</option>
                        <option value="hide">Hide completely from list</option>
                    </select>
                </div>

                <div className="setting-row" style={{ alignItems: 'center' }}>
                    <div className="setting-label-block">
                        <div className="setting-title">Avoided Tags</div>
                        <div className="setting-desc">Add tags you wish to filter out or blur</div>
                    </div>

                    <div className="blacklist-input-wrapper">
                        <div style={{ position: 'relative', flexGrow: 1 }}>
                            <input 
                                type="text" 
                                className="setting-input" 
                                placeholder="Tag name (e.g. mind control)"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onFocus={() => setFocused(true)}
                                onBlur={() => setTimeout(() => setFocused(false), 200)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddBlacklist();
                                }}
                                style={{ width: '100%' }}
                            />
                            
                            {focused && suggestions.length > 0 && (
                                <div className="tag-suggestions-dropdown">
                                    {suggestions.map(tag => (
                                        <div 
                                            key={tag} 
                                            className="tag-suggestion-item"
                                            onClick={() => handleAddBlacklist(tag)}
                                        >
                                            {tag}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button className="blacklist-add-btn" onClick={() => handleAddBlacklist()}>
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                <div className="blacklist-tags-container" style={{ width: '100%' }}>
                    <div className="blacklist-tags-box">
                        {settings.blacklistedTags.length === 0 ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No filtered tags added.</span>
                        ) : (
                            settings.blacklistedTags.map(tag => (
                                <span key={tag} className={`blacklist-tag ${isResetting ? 'reset-exit' : ''}`}>
                                    {tag}
                                    <span className="blacklist-tag-remove" onClick={() => handleRemoveBlacklist(tag)}>
                                        <Trash2 size={12} />
                                    </span>
                                </span>
                            ))
                        )}
                    </div>

                    {settings.blacklistedTags.length > 0 && (
                        <button 
                            className="btn-secondary"
                            onClick={() => {
                                if (confirmReset) {
                                    setIsResetting(true);
                                    setTimeout(() => {
                                        handleSave({ ...settings, blacklistedTags: [] });
                                        setIsResetting(false);
                                        setConfirmReset(false);
                                    }, 300);
                                } else {
                                    setConfirmReset(true);
                                    setTimeout(() => setConfirmReset(false), 3000);
                                }
                            }}
                            style={{ 
                                marginTop: '12px', 
                                fontSize: '12px', 
                                padding: '6px 12px', 
                                color: 'var(--primary)', 
                                borderColor: 'var(--primary)',
                                alignSelf: 'flex-start'
                            }}
                        >
                            {confirmReset ? 'Confirm Reset?' : 'Reset Tag'}
                        </button>
                    )}
                </div>
            </div>

            <div className="settings-section">
                <div className="settings-section-title">Offline Path Settings</div>
                
                <div className="setting-row">
                    <div className="setting-label-block">
                        <div className="setting-title">Downloads Save Path</div>
                        <div className="setting-desc">Local directory where downloads are saved offline</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ 
                            fontSize: '13px', 
                            color: 'var(--text-muted)', 
                            backgroundColor: 'var(--bg-input)',
                            padding: '8px 12px',
                            borderRadius: 'var(--border-radius-sm)',
                            border: '1px solid var(--border-light)',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }} title={settings.downloadPath}>
                            {settings.downloadPath}
                        </span>
                        <button 
                            className="btn-secondary" 
                            onClick={async () => {
                                try {
                                    const path = await (window as any).electron.selectDirectory();
                                    if (path) {
                                        handleSave({ ...settings, downloadPath: path });
                                    }
                                } catch (e: any) {
                                    console.error('Failed to select directory', e);
                                }
                            }}
                            style={{ padding: '8px 16px', fontSize: '13px' }}
                        >
                            Change Path
                        </button>
                    </div>
                </div>

                <div className="setting-row" style={{ marginTop: '16px' }}>
                    <div className="setting-label-block">
                        <div className="setting-title">PDF Export Directory</div>
                        <div className="setting-desc">Custom directory where all exported PDF files will be saved</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ 
                            fontSize: '13px', 
                            color: 'var(--text-muted)', 
                            background: 'var(--bg-input)', 
                            padding: '8px 12px', 
                            borderRadius: 'var(--border-radius-sm)',
                            border: '1px solid var(--border-light)',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }} title={settings.pdfSaveDir || 'Default (Downloads Folder)'}>
                            {settings.pdfSaveDir || 'Default (Downloads Folder)'}
                        </span>
                        <button 
                            className="btn-secondary" 
                            onClick={async () => {
                                try {
                                    const path = await (window as any).electron.selectDirectory();
                                    if (path) {
                                        handleSave({ ...settings, pdfSaveDir: path });
                                    }
                                } catch (e: any) {
                                    console.error('Failed to select directory', e);
                                }
                            }}
                            style={{ padding: '8px 16px', fontSize: '13px' }}
                        >
                            Change Path
                        </button>
                    </div>
                </div>

                <div className="setting-row" style={{ marginTop: '16px' }}>
                    <div className="setting-label-block">
                        <div className="setting-title">Download Speed Limit (KB/s)</div>
                        <div className="setting-desc">Throttle download speed in KB/s (enter 0 for unlimited)</div>
                    </div>
                    <input 
                        type="number"
                        min="0"
                        className="setting-input"
                        placeholder="0 (Unlimited)"
                        value={settings.downloadSpeedLimit ?? 0}
                        onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            handleSelectChange('downloadSpeedLimit', isNaN(val) || val < 0 ? 0 : val);
                        }}
                    />
                </div>

                <div className="setting-row" style={{ marginTop: '16px' }}>
                    <div className="setting-label-block">
                        <div className="setting-title">Max Concurrent Downloads</div>
                        <div className="setting-desc">Number of active downloads processed together (minimum 1, cannot be empty)</div>
                    </div>
                    <input 
                        type="number"
                        min="1"
                        className="setting-input"
                        placeholder="1"
                        value={settings.maxConcurrentDownloads ?? 1}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                                handleSelectChange('maxConcurrentDownloads', 1);
                                return;
                            }
                            const val = parseInt(raw, 10);
                            handleSelectChange('maxConcurrentDownloads', isNaN(val) || val < 1 ? 1 : val);
                        }}
                    />
                </div>
            </div>

            {/* PIN/Password Lock trigger modal */}
            {pinMode === 'setup' && (
                <PINLock 
                    correctPinHash=""
                    mode="setup"
                    lockType={settings.lockType || 'pin'}
                    onSuccess={() => setPinMode('none')}
                    onCancel={() => setPinMode('none')}
                    onSetupPin={(pin) => {
                        handleSave({ ...settings, pinEnabled: true, pinHash: pin });
                    }}
                />
            )}

            {pinMode === 'disable' && (
                <PINLock 
                    correctPinHash={settings.pinHash}
                    mode="disable"
                    lockType={settings.lockType || 'pin'}
                    onSuccess={() => {
                        handleSave({ ...settings, pinEnabled: false, pinHash: '' });
                        setPinMode('none');
                    }}
                    onCancel={() => setPinMode('none')}
                />
            )}
        </div>
    );
};
