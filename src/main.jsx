import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    addDoc, 
    deleteDoc, 
    doc 
} from 'firebase/firestore';
import { 
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
    Download 
} from 'lucide-react';

// --- Firebase 配置 ---
// 從環境變數獲取配置，若在本地運行請確保 __firebase_config 已正確定義
const appId = typeof __app_id !== 'undefined' ? __app_id : 'photo-vault-public';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

const App = () => {
    const [db, setDb] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [view, setView] = useState('gallery');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [pendingUploads, setPendingUploads] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const fileInputRef = useRef(null);

    // 1. 初始化 Firebase
    useEffect(() => {
        if (!firebaseConfig.apiKey) {
            console.error("Firebase 配置缺失。");
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const dbInstance = getFirestore(app);
            setDb(dbInstance);
        } catch (err) {
            console.error("Firebase 初始化失敗", err);
        }
    }, []);

    // 2. 監聽 Firestore 數據 (使用公共路徑)
    useEffect(() => {
        if (!db) return;
        
        // 遵循 Rule 1: 使用公共路徑 /artifacts/{appId}/public/data/{collectionName}
        const photosCollection = collection(db, 'artifacts', appId, 'public', 'data', 'photos');

        const unsubscribe = onSnapshot(photosCollection, (snapshot) => {
            setPhotos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => {
            console.error("讀取數據失敗:", err);
            if (err.code === 'permission-denied') {
                setMessage({ text: '讀取被拒絕，請檢查 Firestore 安全規則是否允許公共存取。', type: 'error' });
            }
        });

        return () => unsubscribe();
    }, [db]);

    // 3. 下載處理
    const handleDownload = (imageData, date) => {
        const link = document.createElement('a');
        link.href = imageData;
        link.download = `${date}_memory.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 4. 檔案選擇
    const handleFilesChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const validFiles = files.filter(file => {
            if (file.size > 800000) {
                setMessage({ text: `檔案 ${file.name} 超過 800KB 限制。`, type: 'error' });
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

    // 5. 批次上傳
    const handleBatchUpload = async (e) => {
        e.preventDefault();
        if (pendingUploads.length === 0 || isUploading || !db) return;

        setIsUploading(true);
        setMessage({ text: `正在上傳至公共相本...`, type: 'info' });

        try {
            const photosCollection = collection(db, 'artifacts', appId, 'public', 'data', 'photos');
            
            for (const item of pendingUploads) {
                await addDoc(photosCollection, {
                    imageData: item.previewUrl,
                    date: item.date,
                    timestamp: Date.now(),
                    fileName: item.file.name
                });
            }
            
            setMessage({ text: '上傳成功！所有人現在都可以看到這些照片。', type: 'success' });
            setPendingUploads([]);
            setTimeout(() => setView('gallery'), 1200);
        } catch (err) {
            console.error("上傳失敗:", err);
            setMessage({ text: `儲存失敗：${err.message}`, type: 'error' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('確定要刪除這張照片嗎？')) return;
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'photos', id);
            await deleteDoc(docRef);
        } catch (err) {
            console.error(err);
            alert('刪除失敗');
        }
    };

    const displayPhotos = useMemo(() => {
        let filtered = photos;
        if (searchQuery) {
            filtered = filtered.filter(p => p.date.includes(searchQuery));
        }
        return [...filtered].sort((a, b) => (a.date > b.date ? -1 : 1));
    }, [photos, searchQuery]);

    return (
        <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans flex flex-col">
            <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-slate-100 z-50">
                <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                            <Camera size={20} />
                        </div>
                        <span className="text-xl font-black tracking-tighter text-slate-800">MemoryArchive</span>
                    </div>
                    
                    <div className="flex items-center space-x-4 md:space-x-8">
                        <button onClick={() => setView('gallery')} className={`flex items-center space-x-1.5 text-sm font-bold transition-all ${view === 'gallery' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-800'}`}>
                            <LayoutGrid size={18} />
                            <span className="hidden sm:block">相片集</span>
                        </button>
                        <button onClick={() => setView('upload')} className={`flex items-center space-x-1.5 text-sm font-bold transition-all ${view === 'upload' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-800'}`}>
                            <Plus size={20} />
                            <span className="hidden sm:block">新增相片</span>
                        </button>
                    </div>
                </div>
            </nav>

            <main className="pt-28 pb-16 max-w-6xl mx-auto px-6 flex-grow w-full">
                {view === 'gallery' && (
                    <div className="space-y-10 animate-in fade-in duration-700">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                            <div className="space-y-2">
                                <h2 className="text-4xl font-black text-slate-900 tracking-tight">公共相簿</h2>
                                <p className="text-slate-400 font-medium">目前共有 {photos.length} 張相片。</p>
                            </div>
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                <input type="text" placeholder="按日期搜尋..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-5 py-3.5 bg-white border border-slate-100 rounded-2xl text-sm focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all outline-none shadow-sm font-medium" />
                            </div>
                        </div>

                        {displayPhotos.length === 0 ? (
                            <div className="py-44 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[3rem] bg-white/40">
                                <ImageIcon size={40} className="text-slate-200 mb-6" />
                                <p className="text-slate-400 font-bold text-lg">目前沒有相片</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
                                {displayPhotos.map((photo) => (
                                    <div key={photo.id} className="group relative bg-white rounded-[2.5rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-700 border border-slate-50">
                                        <div className="absolute top-6 right-6 z-20 flex flex-col space-y-3 opacity-0 group-hover:opacity-100 transition-all duration-500">
                                            <button onClick={() => handleDownload(photo.imageData, photo.date)} className="p-3 bg-white text-slate-700 hover:bg-indigo-600 hover:text-white rounded-2xl shadow-xl border border-slate-100"><Download size={18} /></button>
                                            <button onClick={() => handleDelete(photo.id)} className="p-3 bg-white text-red-500 hover:bg-red-500 hover:text-white rounded-2xl shadow-xl border border-slate-100"><Trash2 size={18} /></button>
                                        </div>
                                        <div className="absolute top-6 left-6 z-10">
                                            <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-2xl text-white text-xs font-black tracking-widest flex items-center space-x-2">
                                                <Calendar size={13} className="text-indigo-400" />
                                                <span>{photo.date}</span>
                                            </div>
                                        </div>
                                        <div className="aspect-[3/4] w-full overflow-hidden bg-slate-50">
                                            <img src={photo.imageData} alt={photo.date} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" loading="lazy" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {view === 'upload' && (
                    <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-12 duration-700">
                        <div className="bg-white rounded-[3.5rem] shadow-2xl p-10 md:p-16 border border-slate-50">
                            <div className="text-center mb-14">
                                <Plus size={36} className="text-indigo-600 mx-auto mb-6" />
                                <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">新增照片</h2>
                                <p className="text-slate-400 font-medium font-bold">上傳照片到公共區域。</p>
                            </div>

                            <div className="space-y-12">
                                <div onClick={() => fileInputRef.current?.click()} className="aspect-[21/6] rounded-[2.5rem] border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all cursor-pointer flex flex-col items-center justify-center group overflow-hidden relative">
                                    <Upload size={36} className="text-indigo-500 mb-4" />
                                    <p className="text-slate-800 font-black text-xl">點擊選取相片</p>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFilesChange} />
                                </div>

                                {pendingUploads.length > 0 && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {pendingUploads.map((item) => (
                                            <div key={item.id} className="flex gap-6 p-6 bg-slate-50 rounded-[2rem] border border-slate-100 relative group animate-in zoom-in-95">
                                                <button onClick={() => removePending(item.id)} className="absolute -top-3 -right-3 bg-white text-slate-400 hover:text-red-500 rounded-full p-2 shadow-xl border border-slate-100 z-20"><X size={16} /></button>
                                                <div className="w-24 h-24 rounded-3xl overflow-hidden flex-shrink-0 shadow-md">
                                                    <img src={item.previewUrl} className="w-full h-full object-cover" alt="Preview" />
                                                </div>
                                                <div className="flex-grow flex flex-col justify-center space-y-3">
                                                    <label className="text-[10px] uppercase tracking-widest font-black text-indigo-500 flex items-center"><Clock size={12} className="mr-2" /> 拍攝日期</label>
                                                    <input type="date" value={item.date} onChange={(e) => updatePendingDate(item.id, e.target.value)} className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {message.text && (
                                    <div className={`p-6 rounded-3xl text-sm font-bold flex items-center space-x-3 ${message.type === 'error' ? 'bg-red-50 text-red-600' : message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                        <AlertCircle size={22} />
                                        <span>{message.text}</span>
                                    </div>
                                )}

                                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6 pt-6">
                                    <button onClick={() => { setPendingUploads([]); setView('gallery'); }} className="flex-1 py-5 px-8 border border-slate-200 rounded-2xl text-slate-500 font-bold hover:bg-slate-50 transition-all">取消</button>
                                    <button onClick={handleBatchUpload} disabled={pendingUploads.length === 0 || isUploading} className="flex-[2] py-5 px-8 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl hover:bg-indigo-700 disabled:opacity-50 transition transform active:scale-[0.98]">
                                        {isUploading ? '正在儲存照片...' : `確認儲存 ${pendingUploads.length} 張相片`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <footer className="py-14 border-t border-slate-100 bg-white">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <p className="text-slate-400 text-sm font-bold tracking-tight">MemoryArchive &copy; 2024</p>
                    <p className="text-slate-200 text-[9px] mt-2 tracking-[0.3em] uppercase font-black italic">Public storage version</p>
                </div>
            </footer>
        </div>
    );
};
import { createRoot } from 'react-dom/client';
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);

export default App;
