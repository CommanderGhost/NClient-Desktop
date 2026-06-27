import React, { useState, useEffect } from 'react';
import { Delete, ArrowLeft, Eye, EyeOff } from 'lucide-react';

interface PINLockProps {
    correctPinHash: string; // Plaintext pin or password value
    onSuccess: () => void;
    onCancel?: () => void;
    mode: 'unlock' | 'setup' | 'disable';
    onSetupPin?: (pin: string) => void;
    lockType?: 'pin' | 'password';
}

export const PINLock: React.FC<PINLockProps> = ({
    correctPinHash,
    onSuccess,
    onCancel,
    mode,
    onSetupPin,
    lockType = 'pin'
}) => {
    const [pin, setPin] = useState<string>('');
    const [confirmPin, setConfirmPin] = useState<string>('');
    const [step, setStep] = useState<number>(1); // 1 = enter, 2 = confirm (only for setup)
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [shake, setShake] = useState<boolean>(false);

    const triggerShake = () => {
        setShake(true);
        setTimeout(() => setShake(false), 450);
    };
    const [showPassword, setShowPassword] = useState<boolean>(false);

    const handleNumberClick = (num: number) => {
        if (lockType === 'pin' && pin.length < 4) {
            setPin(prev => prev + num);
            setErrorMsg('');
        }
    };

    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
    };

    const handleClear = () => {
        setPin('');
    };

    const handlePasswordSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmedVal = pin.trim();
        if (!trimmedVal) {
            setErrorMsg('Password cannot be empty.');
            return;
        }

        if (mode === 'unlock' || mode === 'disable') {
            if (trimmedVal === correctPinHash) {
                onSuccess();
            } else {
                triggerShake();
                setErrorMsg('Invalid password. Try again.');
                setPin('');
            }
        } else if (mode === 'setup') {
            if (step === 1) {
                setConfirmPin(trimmedVal);
                setPin('');
                setStep(2);
                setErrorMsg('');
            } else {
                if (trimmedVal === confirmPin) {
                    if (onSetupPin) onSetupPin(trimmedVal);
                    onSuccess();
                } else {
                    triggerShake();
                    setErrorMsg('Passwords do not match. Restarting.');
                    setPin('');
                    setConfirmPin('');
                    setStep(1);
                }
            }
        }
    };

    // Auto-submit for 4-digit PIN
    useEffect(() => {
        if (lockType === 'pin' && pin.length === 4) {
            if (mode === 'unlock' || mode === 'disable') {
                if (pin === correctPinHash) {
                    onSuccess();
                } else {
                    triggerShake();
                    setErrorMsg('Invalid PIN. Try again.');
                    setPin('');
                }
            } else if (mode === 'setup') {
                if (step === 1) {
                    setConfirmPin(pin);
                    setPin('');
                    setStep(2);
                } else {
                    if (pin === confirmPin) {
                        if (onSetupPin) onSetupPin(pin);
                        onSuccess();
                    } else {
                        triggerShake();
                        setErrorMsg('PIN codes do not match. Restarting.');
                        setPin('');
                        setConfirmPin('');
                        setStep(1);
                    }
                }
            }
        }
    }, [pin, confirmPin, step, mode, correctPinHash, onSuccess, onSetupPin, lockType]);

    // Keyboard Integration
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (lockType === 'pin') {
                if (e.key >= '0' && e.key <= '9') {
                    handleNumberClick(parseInt(e.key, 10));
                } else if (e.key === 'Backspace') {
                    handleBackspace();
                }
            }
            if (e.key === 'Escape' && onCancel) {
                onCancel();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin, lockType, onCancel]);

    const getTitle = () => {
        const label = lockType === 'password' ? 'Password' : 'PIN';
        if (mode === 'unlock') return `Enter ${label} to Access`;
        if (mode === 'disable') return `Enter current ${label} to Disable`;
        if (mode === 'setup') {
            return step === 1 ? `Enter New ${label}` : `Confirm New ${label}`;
        }
        return `Enter ${label}`;
    };

    return (
        <div className={`pin-lock-overlay ${shake ? 'shake-error' : ''}`} style={{ zIndex: 9999 }}>
            {onCancel && (
                <button 
                    onClick={onCancel}
                    className="btn-secondary"
                    style={{
                        position: 'absolute',
                        top: 24,
                        left: 24,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        cursor: 'pointer'
                    }}
                >
                    <ArrowLeft size={16} />
                    Back
                </button>
            )}
            
            <div className="pin-title" style={{ marginBottom: '16px' }}>{getTitle()}</div>
            
            {errorMsg && (
                <div style={{ color: 'var(--primary)', fontSize: '14px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center' }}>
                    {errorMsg}
                </div>
            )}

            {lockType === 'pin' ? (
                <>
                    <div className="pin-dots">
                        {[0, 1, 2, 3].map(i => (
                            <div 
                                key={i} 
                                className={`pin-dot ${i < pin.length ? 'filled' : ''} ${i === pin.length ? 'active' : ''}`}
                            />
                        ))}
                    </div>

                    <div className="pin-keypad">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                            <button 
                                key={num} 
                                className="keypad-btn" 
                                onClick={() => handleNumberClick(num)}
                            >
                                {num}
                            </button>
                        ))}
                        
                        <button className="keypad-btn" onClick={handleClear} style={{ fontSize: '14px' }}>
                            Clear
                        </button>
                        
                        <button className="keypad-btn" onClick={() => handleNumberClick(0)}>
                            0
                        </button>
                        
                        <button className="keypad-btn" onClick={handleBackspace}>
                            <Delete size={20} />
                        </button>
                    </div>
                </>
            ) : (
                <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '320px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <input 
                            type={showPassword ? 'text' : 'password'}
                            className="setting-input"
                            value={pin}
                            onChange={(e) => {
                                setPin(e.target.value);
                                setErrorMsg('');
                            }}
                            placeholder="Enter password..."
                            autoFocus
                            style={{ 
                                width: '100%', 
                                paddingRight: '40px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid var(--border-light)',
                                fontSize: '15px',
                                height: '45px'
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(prev => !prev)}
                            style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    <button 
                        type="submit" 
                        className="btn-primary" 
                        style={{ width: '100%', height: '42px', fontWeight: 'bold', justifyContent: 'center' }}
                    >
                        {mode === 'setup' ? (step === 1 ? 'Next' : 'Confirm & Enable') : (mode === 'disable' ? 'Disable Lock' : 'Unlock')}
                    </button>
                </form>
            )}
        </div>
    );
};
