import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged, 
    signInWithCustomToken
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    addDoc, 
    deleteDoc, 
    doc
} from 'firebase/firestore';
import { 
    LogOut, 
    LogIn, 
    Plus, 
    Trash2, 
    Calendar, 
    Image as ImageIcon, 
    LayoutGrid, 
    Upload, 
    X, 
    Clock, 
    Camera, 
    Search, 
    AlertCircle, 
    Check, 
    ShieldCheck, 
    Download 
} from 'lucide-react';

// --- Firebase 配置 (請確保在運行時這些變數已定義或手動填入) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'photo-vault-pro';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [photos, setPhotos] = useState([]);
    const [view, setView] = useState('gallery'); // 'gallery' | 'upload'
    const [searchQuery, setSearchQuery] = useState('');
    
    const [pendingUploads, setPendingUploads] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const fileInputRef = useRef(null);

    // 1. 初始化 Firebase 服務
    useEffect(() => {
        if (!firebaseConfig.apiKey) {
            console.error("Firebase API Key 缺失，請檢查配置。");
            return;
        }
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);
        setAuth(authInstance);
        setDb(dbInstance);

        // 監聽登入狀態切換
        const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else if (initialAuthToken) {
                try {
                    const result = await signInWithCustomToken(authInstance, initialAuthToken);
                    setUser(result.user);
                } catch (e) {
                    console.error("Token 登入失敗", e);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // 2. 監聽雲端資料庫 (依據目前登入的 Google UID)
    useEffect(() => {
        if (!isAuthReady || !db || !user) return;
        
        const collectionPath = `artifacts/${appId}/users/${user.uid}/photos`;
        const q = collection(db, collectionPath);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPhotos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => {
            console.error("資料讀取失敗:", err);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, user]);

    // 3. 下載相片邏輯
    const handleDownload = (imageData, date) => {
        const link = document.createElement('a');
        link.href = imageData;
        // 使用拍攝日期作為檔名，方便電腦管理
        link.download = `${date}_memory.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 4. 批次檔案選擇與預覽處理
    const handleFilesChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const validFiles = files.filter(file => {
            if (file.size > 800000) {
                setMessage({ text: `檔案 ${file.name} 超過 800KB，請選用較小的照片。`, type: 'error' });
                return false;
            }
            return true;
        });

        const defaultDate = new Date().toISOString().split('T')[0];

        validFiles.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPendingUploads(prev => [
                    ...prev, 
                    { 
                        id: Math.random().toString(36).substr(2, 9),
                        file, 
                        previewUrl: reader.result, 
                        date: defaultDate 
                    }
                ]);
            };
            reader.readAsDataURL(file);
        });
    };

    const updatePendingDate = (id, newDate) => {
        setPendingUploads(prev => prev.map(item => item.id === id ? { ...item, date: newDate } : item));
    };

    const removePending = (id) => {
        setPendingUploads(prev => prev.filter(item => item.id !== id));
    };

    // 5. 批次上傳至 Firestore
    const handleBatchUpload = async (e) => {
        e.preventDefault();
        if (pendingUploads.length === 0 || isUploading || !user) return;

        setIsUploading(true);
        setMessage({ text: `正在安全地將照片備份至雲端...`, type: 'info' });

        try {
            const collectionPath = `artifacts/${appId}/users/${user.uid}/photos`;
            
            for (const item of pendingUploads) {
                await addDoc(collection(db, collectionPath), {
                    imageData: item.previewUrl,
                    date: item.date,
                    timestamp: Date.now(),
                    fileName: item.file.name
                });
            }
            
            setMessage({ text: '上傳成功！照片已同步至您的帳號。', type: 'success' });
            setPendingUploads([]);
            setTimeout(() => setView('gallery'), 1200);
        } catch (err) {
            console.error("上傳失敗:", err);
            setMessage({ text: '儲存失敗，請檢查網路狀態。', type: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('確定要永久刪除這張照片嗎？')) return;
        try {
            const docPath = `artifacts/${appId}/users/${user.uid}/photos/${id}`;
            await deleteDoc(doc(db, docPath));
        } catch (err) {
            console.error("刪除失敗:", err);
            alert('刪除失敗');
        }
    };

    // 6. 搜尋與排序邏輯 (由新到舊排序)
    const displayPhotos = useMemo(() => {
        let filtered = photos;
        if (searchQuery) {
            filtered = filtered.filter(p => p.date.includes(searchQuery));
        }
        return [...filtered].sort((a, b) => {
            if (a.date > b.date) return -1;
            if (a.date < b.date) return 1;
            return b.timestamp - a.timestamp;
        });
    }, [photos, searchQuery]);

    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("登入失敗:", error);
            setMessage({ text: '登入失敗，請稍後再試。', type: 'error' });
        }
    };

    // --- 登入畫面 UI ---
    if (!user && isAuthReady) {
        return (
            <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-[3rem] shadow-2xl shadow-indigo-100 p-12 text-center border border-slate-100">
                    <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white mx-auto mb-8 shadow-lg transform -rotate-6">
                        <Camera size={40} />
                    </div>
                    <h1 className="text-4xl font-black text-slate-800 mb-4 tracking-tighter">MemoryArchive</h1>
                    <p className="text-slate-500 mb-10 leading-relaxed font-medium">
                        您的專屬私人雲端相冊。<br/>登入後即可找回您保存的回憶。
                    </p>
                    <button 
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center space-x-3 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition transform active:scale-[0.98] shadow-xl"
                    >
                        <LogIn size={20} />
                        <span>使用 Google 登入</span>
                    </button>
                    <div className="mt-8 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase tracking-widest space-x-2">
                        <ShieldCheck size={14} />
                        <span>加密傳輸與隱私保護</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans flex flex-col">
            {/* 導覽列 (頂部固定) */}
            <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-slate-100 z-50">
                <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                            <Camera size={20} />
                        </div>
                        <span className="text-xl font-black tracking-tighter text-slate-800 hidden xs:block">MemoryArchive</span>
                    </div>
                    
                    <div className="flex items-center space-x-4 md:space-x-8">
                        <button 
                            onClick={() => setView('gallery')}
                            className={`flex items-center space-x-1.5 text-sm font-bold transition-all ${view === 'gallery' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-800'}`}
                        >
                            <LayoutGrid size={18} />
                            <span className="hidden sm:block">查看相簿</span>
                        </button>
                        <button 
                            onClick={() => setView('upload')}
                            className={`flex items-center space-x-1.5 text-sm font-bold transition-all ${view === 'upload' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-800'}`}
                        >
                            <Plus size={20} />
                            <span className="hidden sm:block">新增相片</span>
                        </button>
                        <div className="h-5 w-[1.5px] bg-slate-100"></div>
                        <div className="flex items-center space-x-3">
                            {user?.photoURL && (
                                <img src={user.photoURL} className="w-8 h-8 rounded-full border border-slate-200" alt="頭像" />
                            )}
                            <button onClick={() => signOut(auth)} className="text-slate-300 hover:text-red-500 transition-colors" title="登出">
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="pt-28 pb-16 max-w-6xl mx-auto px-6 flex-grow w-full">
                {/* --- 視圖：相片集 --- */}
                {view === 'gallery' && (
                    <div className="space-y-10 animate-in fade-in duration-700">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <h2 className="text-4xl font-black text-slate-900 tracking-tight">時光走廊</h2>
                                <p className="text-slate-400 font-medium">{user?.displayName}，目前為您保管了 {photos.length} 份回憶。</p>
                            </div>
                            
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                <input 
                                    type="text"
                                    placeholder="快速搜尋日期 (YYYY-MM-DD)"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-5 py-3.5 bg-white border border-slate-100 rounded-2xl text-sm focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none shadow-sm font-medium"
                                />
                            </div>
                        </div>

                        {displayPhotos.length === 0 ? (
                            <div className="py-44 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/40">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-6">
                                    <ImageIcon size={40} />
                                </div>
                                <p className="text-slate-400 font-bold text-lg">
                                    {searchQuery ? '沒有找到符合日期的照片' : '您的相簿目前是空的，立即開始上傳吧'}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
                                {displayPhotos.map((photo) => (
                                    <div key={photo.id} className="group relative bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-700 border border-slate-50">
                                        {/* 下載與刪除按鈕 (懸停時顯示) */}
                                        <div className="absolute top-6 right-6 z-20 flex flex-col space-y-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                                            <button 
                                                onClick={() => handleDownload(photo.imageData, photo.date)}
                                                className="p-3 bg-white/95 backdrop-blur text-slate-700 hover:bg-indigo-600 hover:text-white rounded-2xl shadow-xl border border-slate-100 transition-all"
                                                title="下載相片"
                                            >
                                                <Download size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(photo.id)}
                                                className="p-3 bg-white/95 backdrop-blur text-red-500 hover:bg-red-500 hover:text-white rounded-2xl shadow-xl border border-slate-100 transition-all"
                                                title="刪除相片"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>

                                        {/* 日期標籤 (固定顯示) */}
                                        <div className="absolute top-6 left-6 z-10">
                                            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg flex items-center space-x-2 border border-white/10">
                                                <Calendar size={13} className="text-indigo-400" />
                                                <span className="text-xs font-black text-white tracking-widest">{photo.date}</span>
                                            </div>
                                        </div>

                                        <div className="aspect-[3/4] w-full overflow-hidden bg-slate-50">
                                            <img 
                                                src={photo.imageData} 
                                                alt={photo.date}
                                                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- 視圖：上傳介面 --- */}
                {view === 'upload' && (
                    <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-12 duration-700">
                        <div className="bg-white rounded-[3.5rem] shadow-2xl shadow-indigo-100/40 p-10 md:p-16 border border-slate-50">
                            <div className="text-center mb-14">
                                <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[2rem] mb-6 shadow-inner">
                                    <Plus size={36} />
                                </div>
                                <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">新增您的回憶</h2>
                                <p className="text-slate-400 font-medium">您可以一次選取多張照片，並為它們標註準確的拍攝日期。</p>
                            </div>

                            <div className="space-y-12">
                                {/* 檔案選取區塊 */}
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="aspect-[21/6] rounded-[2.5rem] border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all cursor-pointer flex flex-col items-center justify-center group overflow-hidden relative"
                                >
                                    <div className="flex flex-col items-center group-hover:scale-105 transition-transform duration-500">
                                        <Upload size={36} className="text-indigo-500 mb-4" />
                                        <p className="text-slate-800 font-black text-xl">點擊開啟裝置檔案</p>
                                        <p className="text-slate-400 text-xs mt-2 font-bold uppercase tracking-widest">支援多選 | 建議單張小於 800KB</p>
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="image/*" 
                                        multiple 
                                        onChange={handleFilesChange}
                                    />
                                </div>

                                {/* 待上傳列表 */}
                                {pendingUploads.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {pendingUploads.map((item) => (
                                            <div key={item.id} className="flex gap-6 p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100 relative group animate-in zoom-in-95">
                                                <button 
                                                    onClick={() => removePending(item.id)}
                                                    className="absolute -top-3 -right-3 bg-white text-slate-400 hover:text-red-500 rounded-full p-2 shadow-xl border border-slate-100 z-20 transition-all"
                                                >
                                                    <X size={16} />
                                                </button>
                                                
                                                <div className="w-28 h-28 rounded-3xl overflow-hidden flex-shrink-0 shadow-md">
                                                    <img src={item.previewUrl} className="w-full h-full object-cover" alt="待上傳預覽" />
                                                </div>
                                                
                                                <div className="flex-grow flex flex-col justify-center space-y-3">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] uppercase tracking-[0.2em] font-black text-indigo-500 flex items-center">
                                                            <Clock size={12} className="mr-2" /> 拍攝日期設定
                                                        </label>
                                                        <input 
                                                            type="date" 
                                                            value={item.date}
                                                            onChange={(e) => updatePendingDate(item.id, e.target.value)}
                                                            className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm shadow-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 通知訊息 */}
                                {message.text && (
                                    <div className={`p-6 rounded-3xl text-sm font-bold flex items-center space-x-3 animate-in slide-in-from-top-4 ${
                                        message.type === 'error' ? 'bg-red-50 text-red-600' : 
                                        message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 
                                        'bg-indigo-50 text-indigo-600'
                                    }`}>
                                        {message.type === 'error' ? <AlertCircle size={22} /> : <Check size={22} />}
                                        <span>{message.text}</span>
                                    </div>
                                )}

                                {/* 按鈕操作區 */}
                                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6 pt-6">
                                    <button 
                                        type="button"
                                        onClick={() => { setPendingUploads([]); setView('gallery'); }}
                                        className="flex-1 py-5 px-8 border border-slate-200 rounded-2xl text-slate-500 font-bold hover:bg-slate-50 transition-all"
                                    >
                                        取消選取
                                    </button>
                                    <button 
                                        onClick={handleBatchUpload}
                                        disabled={pendingUploads.length === 0 || isUploading}
                                        className="flex-[2] py-5 px-8 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition transform active:scale-[0.98] flex items-center justify-center space-x-3"
                                    >
                                        {isUploading ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                                <span>正在同步至您的 Google 帳戶...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck size={22} />
                                                <span>確認儲存 {pendingUploads.length} 張相片</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <footer className="py-14 border-t border-slate-100 bg-white mt-auto">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <p className="text-slate-400 text-sm font-bold tracking-tight">MemoryArchive &copy; 2024</p>
                    <p className="text-slate-200 text-[9px] mt-2 tracking-[0.3em] uppercase font-black">由 Firebase 安全加密技術提供支援</p>
                </div>
            </footer>
        </div>
    );
};
import { creatRoot} form 'react-dom/client';
const container = document.getElementById('root');
const root = creatRoot(container);
root.render(<MemoryArchive/>);

export default App;
