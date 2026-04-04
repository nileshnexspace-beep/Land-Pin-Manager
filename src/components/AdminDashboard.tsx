import React, { useState, useEffect } from 'react';
import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps';
import { Plot } from '../types';
import { MapPin, Upload, Share2, Check, FileText, LogOut, Edit, Trash2, Users, Plus, X, Search } from 'lucide-react';
import { db, auth, storage } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll, uploadBytesResumable } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import Logo from './Logo';
import { APP_VERSION } from '../version';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDp7t8pm5AiaY5HdnegA9_csUIqlD3HXao';

export default function AdminDashboard() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [newPlotPos, setNewPlotPos] = useState<{lat: number, lng: number} | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form state
  const [societyName, setSocietyName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [size, setSize] = useState('');
  const [pricePerSqyd, setPricePerSqyd] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [locality, setLocality] = useState('');
  const [showLocalitySuggestions, setShowLocalitySuggestions] = useState(false);
  const [propertyTag, setPropertyTag] = useState<'Owner' | 'Broker'>('Owner');
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter state
  const [filterPropertyTag, setFilterPropertyTag] = useState<'All' | 'Owner' | 'Broker'>('All');
  const [filterMinSize, setFilterMinSize] = useState('');
  const [filterMaxSize, setFilterMaxSize] = useState('');
  const [filterLocalities, setFilterLocalities] = useState<string[]>([]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedPlotIds, setSelectedPlotIds] = useState<string[]>([]);
  
  // Team Management State
  const [userRole, setUserRole] = useState<'admin' | 'member' | 'unauthorized' | 'loading'>('loading');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [newTeamRole, setNewTeamRole] = useState<'admin' | 'member'>('member');
  const [isAddingTeamMember, setIsAddingTeamMember] = useState(false);

  useEffect(() => {
    if (!auth.currentUser || !auth.currentUser.email) return;

    const checkAccess = async () => {
      const email = auth.currentUser!.email!.toLowerCase();
      if (email === 'nileshhirpara811@gmail.com') {
        setUserRole('admin');
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, 'allowed_emails', email));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role as 'admin' | 'member');
        } else {
          setUserRole('unauthorized');
        }
      } catch (err) {
        console.error("Error checking access", err);
        setUserRole('unauthorized');
      }
    };

    checkAccess();
  }, []);

  useEffect(() => {
    if (userRole === 'unauthorized' || userRole === 'loading') return;

    const qPlots = query(collection(db, 'plots'));
    const qOwners = query(collection(db, 'plot_owners'));

    let plotsData: any[] = [];
    let ownersData: any[] = [];

    const unsubscribePlots = onSnapshot(qPlots, (snapshot) => {
      plotsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      combineData();
    }, (error) => {
      console.error("Error fetching plots:", error);
    });

    const unsubscribeOwners = onSnapshot(qOwners, (snapshot) => {
      ownersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      combineData();
    }, (error) => {
      console.error("Error fetching owners:", error);
    });

    function combineData() {
      const combined = plotsData.map(plot => {
        const owner = ownersData.find(o => o.id === plot.id) || {};
        // Handle renamed fields if they exist in older documents
        const contactName = owner.contactName || owner.ownerName || '';
        const contactNumber = owner.contactNumber || owner.ownerNumber || '';
        return { ...plot, ...owner, contactName, contactNumber };
      });
      setPlots(combined);
    }

    return () => {
      unsubscribePlots();
      unsubscribeOwners();
    };
  }, [userRole]);

  useEffect(() => {
    if (userRole !== 'admin') return;
    
    const unsubscribeTeam = onSnapshot(collection(db, 'allowed_emails'), (snapshot) => {
      setTeamMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    return () => unsubscribeTeam();
  }, [userRole]);

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamEmail || !auth.currentUser?.email) return;
    
    setIsAddingTeamMember(true);
    try {
      await setDoc(doc(db, 'allowed_emails', newTeamEmail.toLowerCase().trim()), {
        email: newTeamEmail.toLowerCase().trim(),
        role: newTeamRole,
        addedBy: auth.currentUser.email,
        createdAt: new Date().toISOString()
      });
      setNewTeamEmail('');
    } catch (err) {
      console.error("Failed to add team member", err);
      alert("Failed to add team member. Check permissions.");
    } finally {
      setIsAddingTeamMember(false);
    }
  };

  const handleRemoveTeamMember = async (email: string) => {
    if (email === 'nileshhirpara811@gmail.com') {
      alert("Cannot remove the primary admin.");
      return;
    }
    if (confirm(`Remove ${email} from the team?`)) {
      try {
        await deleteDoc(doc(db, 'allowed_emails', email));
      } catch (err) {
        console.error("Failed to remove team member", err);
      }
    }
  };

  const handleMapClick = (e: any) => {
    if (isAdding && e.detail.latLng) {
      const lat = e.detail.latLng.lat;
      const lng = e.detail.latLng.lng;
      setNewPlotPos({ lat, lng });
      setLocationInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  };

  const parseCoordinates = (val: string) => {
    // Try to parse coordinates from various Google Maps URL formats or raw lat/lng
    let match = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/search\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      setNewPlotPos({ lat, lng });
      return true;
    }
    return false;
  };

  const handleLocationInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocationInput(val);
  };

  const handleMarkPin = async () => {
    if (!locationInput) return;
    
    if (parseCoordinates(locationInput)) return;

    // Handle shortened links if possible
    if (locationInput.includes('maps.app.goo.gl') || locationInput.includes('goo.gl/maps')) {
      try {
        const response = await fetch('/api/resolve-map-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: locationInput })
        });
        const data = await response.json();
        if (data.finalUrl) {
          parseCoordinates(data.finalUrl);
        }
      } catch (error) {
        console.error("Error resolving shortened link:", error);
      }
    }
  };

  const handleSizeChange = (val: string) => {
    setSize(val);
    const s = parseFloat(val);
    const p = parseFloat(pricePerSqyd);
    const t = parseFloat(totalPrice);

    if (!isNaN(s) && !isNaN(p)) {
      setTotalPrice((s * p).toFixed(2));
    } else if (!isNaN(s) && !isNaN(t)) {
      setPricePerSqyd((t / s).toFixed(2));
    }
  };

  const handlePricePerSqydChange = (val: string) => {
    setPricePerSqyd(val);
    const s = parseFloat(size);
    const p = parseFloat(val);

    if (!isNaN(s) && !isNaN(p)) {
      setTotalPrice((s * p).toFixed(2));
    }
  };

  const handleTotalPriceChange = (val: string) => {
    setTotalPrice(val);
    const s = parseFloat(size);
    const t = parseFloat(val);

    if (!isNaN(s) && !isNaN(t) && s !== 0) {
      setPricePerSqyd((t / s).toFixed(2));
    }
  };

  const startEditing = (plot: Plot) => {
    setIsAdding(true);
    setEditingPlotId(plot.id);
    setNewPlotPos({ lat: plot.lat, lng: plot.lng });
    setLocationInput(`${plot.lat.toFixed(6)}, ${plot.lng.toFixed(6)}`);
    setSocietyName(plot.societyName || '');
    setUnitNumber(plot.unitNumber || '');
    setContactName(plot.contactName || '');
    setContactNumber(plot.contactNumber || '');
    setSize(plot.size?.toString() || '');
    setPricePerSqyd(plot.pricePerSqyd?.toString() || '');
    setTotalPrice(plot.totalPrice?.toString() || '');
    setLocality(plot.locality || '');
    setPropertyTag(plot.propertyTag || 'Owner');
    setDetails(plot.details || '');
    setFiles(null);
    setSelectedPlot(null); // Close info window
  };

  const handleDeletePlot = async (plotId: string) => {
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, 'plots', plotId));
      await deleteDoc(doc(db, 'plot_owners', plotId));
      
      // Delete files from Storage
      const folderRef = ref(storage, `plots/${plotId}`);
      try {
        const fileList = await listAll(folderRef);
        const deletePromises = fileList.items.map(itemRef => deleteObject(itemRef));
        await Promise.all(deletePromises);
      } catch (storageErr) {
        console.warn("Could not delete some storage files or folder was empty", storageErr);
      }
      
      setShowDeleteConfirm(null);
      if (selectedPlot?.id === plotId) {
        setSelectedPlot(null);
      }
    } catch (err) {
      console.error('Failed to delete plot', err);
      alert('Failed to delete plot. Please check your permissions.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlotPos || !auth.currentUser) return;

    setIsSubmitting(true);
    setUploadProgress({});
    const plotId = editingPlotId || crypto.randomUUID();

    try {
      let documents = editingPlotId ? (plots.find(p => p.id === editingPlotId)?.documents || []) : [];
      
      if (files && files.length > 0) {
        console.log(`Starting upload of ${files.length} files...`);
        const uploadPromises = Array.from(files).map((file: File) => {
          return new Promise<{ name: string, url: string }>((resolve, reject) => {
            const storageRef = ref(storage, `plots/${plotId}/${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
              }, 
              (error) => {
                console.error("Upload failed for", file.name, error);
                reject(new Error(`Failed to upload ${file.name}: ${error.message}`));
              }, 
              async () => {
                try {
                  const url = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve({ name: file.name, url });
                } catch (urlErr) {
                  reject(urlErr);
                }
              }
            );
          });
        });
        
        const newDocs = await Promise.all(uploadPromises);
        documents = [...documents, ...newDocs];
        console.log("All files uploaded successfully");
      }

      console.log("Saving plot data to Firestore...");

      const plotData = {
        lat: newPlotPos.lat,
        lng: newPlotPos.lng,
        societyName,
        unitNumber,
        size: parseFloat(size) || 0,
        pricePerSqyd: parseFloat(pricePerSqyd) || 0,
        totalPrice: parseFloat(totalPrice) || 0,
        locality,
        propertyTag,
        details,
        documents,
        authorUid: editingPlotId ? (plots.find(p => p.id === editingPlotId)?.authorUid || auth.currentUser.uid) : auth.currentUser.uid
      };

      const ownerData = {
        contactName,
        contactNumber,
        authorUid: editingPlotId ? (plots.find(p => p.id === editingPlotId)?.authorUid || auth.currentUser.uid) : auth.currentUser.uid
      };

      await setDoc(doc(db, 'plots', plotId), plotData, { merge: true });
      await setDoc(doc(db, 'plot_owners', plotId), ownerData, { merge: true });
      
      // Reset form
      setNewPlotPos(null);
      setIsAdding(false);
      setEditingPlotId(null);
      setLocationInput('');
      setSocietyName('');
      setUnitNumber('');
      setContactName('');
      setContactNumber('');
      setSize('');
      setPricePerSqyd('');
      setTotalPrice('');
      setLocality('');
      setPropertyTag('Owner');
      setDetails('');
      setFiles(null);
      setUploadProgress({});
    } catch (err) {
      console.error('Failed to save plot', err);
      alert('Failed to save plot. Please check your permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyShareLink = (id: string) => {
    const pathname = window.location.pathname.endsWith('/') ? window.location.pathname : `${window.location.pathname}/`;
    const url = `${window.location.origin}${pathname}#/share/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredPlots = plots.filter(plot => {
    // Search term filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      (plot.contactName?.toLowerCase() || '').includes(searchLower) ||
      (plot.societyName?.toLowerCase() || '').includes(searchLower) ||
      (plot.details?.toLowerCase() || '').includes(searchLower) ||
      (plot.unitNumber?.toLowerCase() || '').includes(searchLower) ||
      (plot.locality?.toLowerCase() || '').includes(searchLower)
    );

    // Property Tag filter
    const matchesTag = filterPropertyTag === 'All' || plot.propertyTag === filterPropertyTag;

    // Size range filter
    const minSize = filterMinSize ? parseFloat(filterMinSize) : 0;
    const maxSize = filterMaxSize ? parseFloat(filterMaxSize) : Infinity;
    const matchesSize = (plot.size || 0) >= minSize && (plot.size || 0) <= maxSize;

    // Locality filter (multi-select)
    const matchesLocality = filterLocalities.length === 0 || (plot.locality && filterLocalities.includes(plot.locality));

    return matchesSearch && matchesTag && matchesSize && matchesLocality;
  });

  const handleShareSelected = () => {
    if (selectedPlotIds.length === 0) return;
    const ids = selectedPlotIds.join(',');
    const shareUrl = `${window.location.origin}${window.location.pathname}#/share/${ids}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId('multi');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePlotSelection = (id: string) => {
    setSelectedPlotIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const allIds = filteredPlots.map(p => p.id);
    if (selectedPlotIds.length === allIds.length) {
      setSelectedPlotIds([]);
    } else {
      setSelectedPlotIds(allIds);
    }
  };

  if (userRole === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (userRole === 'unauthorized') {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogOut size={32} />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Access Denied</h1>
          <p className="text-neutral-600 mb-6">
            You are not authorized to access this dashboard. Please contact the administrator to be added to the team.
          </p>
          <button 
            onClick={() => signOut(auth)}
            className="px-6 py-2 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Sidebar */}
      <div className="w-96 bg-white border-r border-neutral-200 flex flex-col shadow-sm z-10">
        <div className="p-6 border-b border-neutral-200 bg-neutral-900 text-white">
          <div className="flex justify-between items-center mb-1">
            <Logo variant="light" />
            <div className="flex items-center gap-1">
              {userRole === 'admin' && (
                <button 
                  onClick={() => setShowTeamModal(true)}
                  className="p-2 text-neutral-400 hover:text-blue-400 hover:bg-white/10 rounded-lg transition-colors"
                  title="Team Settings"
                >
                  <Users size={20} />
                </button>
              )}
              <button 
                onClick={() => signOut(auth)}
                className="p-2 text-neutral-400 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors"
                title="Sign Out"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-neutral-400">Plots Mapping Tool</p>
            <span className="text-[10px] text-neutral-600 font-bold">v{APP_VERSION}</span>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {!isAdding && !newPlotPos ? (
            <div className="space-y-4">
              <button
                onClick={() => {
                  setIsAdding(true);
                  setEditingPlotId(null);
                  setLocationInput('');
                  setSocietyName('');
                  setUnitNumber('');
                  setContactName('');
                  setContactNumber('');
                  setSize('');
                  setPricePerSqyd('');
                  setTotalPrice('');
                  setLocality('');
                  setPropertyTag('Owner');
                  setDetails('');
                  setFiles(null);
                }}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                + Add New Plot
              </button>

              <div className="space-y-4 mt-4 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name, society, details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  <Search className="absolute left-3 top-2.5 text-neutral-400" size={18} />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Property Tag</label>
                    <div className="flex gap-2">
                      {['All', 'Owner', 'Broker'].map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setFilterPropertyTag(tag as any)}
                          className={`flex-1 py-1 text-xs rounded-md border transition-colors ${
                            filterPropertyTag === tag 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Size Range</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filterMinSize}
                        onChange={(e) => setFilterMinSize(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                      <span className="text-neutral-400">-</span>
                      <input
                        type="number"
                        placeholder="Max"
                        value={filterMaxSize}
                        onChange={(e) => setFilterMaxSize(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-1">Locality Filter</label>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 border border-neutral-200 rounded bg-white">
                      {Array.from(new Set(plots.map(p => p.locality).filter(Boolean))).map((loc) => (
                        <button
                          key={loc}
                          onClick={() => {
                            setFilterLocalities(prev => 
                              prev.includes(loc!) ? prev.filter(l => l !== loc) : [...prev, loc!]
                            );
                          }}
                          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                            filterLocalities.includes(loc!)
                              ? 'bg-blue-100 text-blue-700 border-blue-200'
                              : 'bg-neutral-50 text-neutral-500 border-neutral-100 hover:bg-neutral-100'
                          }`}
                        >
                          {loc}
                        </button>
                      ))}
                      {plots.filter(p => p.locality).length === 0 && (
                        <span className="text-[10px] text-neutral-400 italic">No localities found</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">
                    Saved Plots ({filteredPlots.length})
                  </h2>
                  <button
                    onClick={selectAllFiltered}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest"
                  >
                    {selectedPlotIds.length === filteredPlots.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {selectedPlotIds.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                    <span className="text-xs font-medium text-blue-700">
                      {selectedPlotIds.length} plots selected
                    </span>
                    <button
                      onClick={handleShareSelected}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      {copiedId === 'multi' ? <Check size={14} /> : <Share2 size={14} />}
                      {copiedId === 'multi' ? 'Link Copied!' : 'Share Selected'}
                    </button>
                  </div>
                )}

                <div className="space-y-3">
                  {filteredPlots.map((plot) => (
                    <div 
                      key={plot.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        selectedPlotIds.includes(plot.id) 
                          ? 'border-blue-400 bg-blue-50/30 shadow-md ring-1 ring-blue-400' 
                          : 'border-neutral-200 bg-white shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedPlotIds.includes(plot.id)}
                            onChange={() => togglePlotSelection(plot.id)}
                            className="mt-1 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <h3 className="font-bold text-neutral-900">
                              {plot.societyName ? `${plot.societyName} - ${plot.unitNumber || ''}` : (plot.contactName || 'Unnamed Plot')}
                            </h3>
                            <div className="flex flex-wrap gap-1 mt-1">
                            {plot.locality && (
                              <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <MapPin size={8} /> {plot.locality}
                              </span>
                            )}
                            {plot.propertyTag && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                plot.propertyTag === 'Owner' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                              }`}>
                                {plot.propertyTag}
                              </span>
                            )}
                            {plot.size && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                                {plot.size} Sqyd
                              </span>
                            )}
                            {plot.pricePerSqyd && (
                              <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                                ₹{plot.pricePerSqyd}/Sqyd
                              </span>
                            )}
                            {plot.totalPrice && (
                              <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                Total: ₹{plot.totalPrice}
                              </span>
                            )}
                          </div>
                          {plot.societyName && (
                            <p className="text-xs text-neutral-500 font-medium mt-1">{plot.contactName}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditing(plot)}
                            className="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Edit Plot"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(plot.id)}
                            className="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Delete Plot"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            onClick={() => copyShareLink(plot.id)}
                            className="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Copy Client Link"
                          >
                            {copiedId === plot.id ? <Check size={16} className="text-green-600" /> : <Share2 size={16} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-neutral-600 mb-1">{plot.contactNumber || 'No Number'}</p>
                      <p className="text-xs text-neutral-500 line-clamp-2">{plot.details}</p>
                      {plot.documents && plot.documents.length > 0 && (
                        <div className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md w-fit">
                          <FileText size={12} />
                          {plot.documents.length} Document(s)
                        </div>
                      )}
                      
                      {showDeleteConfirm === plot.id && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                          <p className="text-sm text-red-800 mb-2 font-medium">Delete this plot?</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleDeletePlot(plot.id)}
                              className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                            >
                              Yes, Delete
                            </button>
                            <button 
                              onClick={() => setShowDeleteConfirm(null)}
                              className="px-3 py-1 bg-white border border-red-200 text-red-700 text-xs rounded hover:bg-red-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {plots.length === 0 && (
                    <div className="text-center py-8 text-neutral-400">
                      <MapPin className="mx-auto mb-2 opacity-50" size={32} />
                      <p>No plots added yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="bg-blue-50 p-4 border-b border-blue-100">
                <h2 className="font-semibold text-blue-900">{editingPlotId ? 'Edit Plot' : 'Add New Plot'}</h2>
                <p className="text-sm text-blue-700 mt-1">Click on the map, drag the pin, or paste a location link.</p>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Location (Link or Coordinates)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={locationInput}
                        onChange={handleLocationInputChange}
                        className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Paste Google Maps link or click on map"
                      />
                      <button
                        type="button"
                        onClick={handleMarkPin}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                      >
                        Enter
                      </button>
                    </div>
                    {newPlotPos ? (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <Check size={12} /> Location set ({newPlotPos.lat.toFixed(4)}, {newPlotPos.lng.toFixed(4)})
                      </p>
                    ) : (
                      <p className="text-xs text-neutral-500 mt-1">
                        Required: Click map to drop pin, or paste a map link and click Enter.
                      </p>
                    )}
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Locality</label>
                    <input
                      type="text"
                      value={locality}
                      onChange={(e) => {
                        setLocality(e.target.value);
                        setShowLocalitySuggestions(true);
                      }}
                      onFocus={() => setShowLocalitySuggestions(true)}
                      onBlur={() => {
                        // Delay hiding to allow clicking on suggestion
                        setTimeout(() => setShowLocalitySuggestions(false), 200);
                      }}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Enter locality name"
                    />
                    {showLocalitySuggestions && (
                      <div className="absolute z-[1100] w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {Array.from(new Set(plots.map(p => p.locality).filter(Boolean)))
                          .filter(loc => (loc as string).toLowerCase().includes(locality.toLowerCase()) && loc !== locality)
                          .map((loc, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setLocality(loc as string);
                                setShowLocalitySuggestions(false);
                              }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-neutral-50 last:border-0"
                            >
                              {loc as string}
                            </button>
                          ))}
                        {Array.from(new Set(plots.map(p => p.locality).filter(Boolean)))
                          .filter(loc => (loc as string).toLowerCase().includes(locality.toLowerCase()) && loc !== locality).length === 0 && locality.length === 0 && (
                            <div className="px-4 py-2 text-xs text-neutral-400 italic">Start typing for suggestions...</div>
                          )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Society Name</label>
                    <input
                      type="text"
                      value={societyName}
                      onChange={(e) => setSocietyName(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Enter society name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Unit Number</label>
                      <input
                        type="text"
                        value={unitNumber}
                        onChange={(e) => setUnitNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="e.g. B-204"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Property Tag</label>
                      <select
                        value={propertyTag}
                        onChange={(e) => setPropertyTag(e.target.value as 'Owner' | 'Broker')}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="Owner">Owner Property</option>
                        <option value="Broker">Broker Property</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Size (Sqyd)</label>
                      <input
                        type="number"
                        value={size}
                        onChange={(e) => handleSizeChange(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Enter size in Sqyd"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Price per Sqyd</label>
                        <input
                          type="number"
                          value={pricePerSqyd}
                          onChange={(e) => handlePricePerSqydChange(e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          placeholder="Price/Sqyd"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Total Price</label>
                        <input
                          type="number"
                          value={totalPrice}
                          onChange={(e) => handleTotalPriceChange(e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          placeholder="Total Price"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Contact Name</label>
                    <input
                      required
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Contact Number</label>
                    <input
                      required
                      type="text"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Land Details</label>
                    <textarea
                      required
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[100px]"
                      placeholder="Size, location features, zoning, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Documents</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-neutral-300 border-dashed rounded-lg hover:bg-neutral-50 transition-colors">
                      <div className="space-y-1 text-center">
                        <Upload className="mx-auto h-12 w-12 text-neutral-400" />
                        <div className="flex text-sm text-neutral-600 justify-center">
                          <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                            <span>Upload files</span>
                            <input
                              type="file"
                              multiple
                              className="sr-only"
                              onChange={(e) => setFiles(e.target.files)}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-neutral-500">PDF, Images up to 10MB</p>
                      </div>
                    </div>
                    {files && files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-sm font-medium text-neutral-700 flex justify-between items-center">
                          <span>{files.length} file(s) selected</span>
                          {!isSubmitting && (
                            <button 
                              type="button"
                              onClick={() => setFiles(null)}
                              className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                            >
                              <X size={12} />
                              Clear
                            </button>
                          )}
                          {isSubmitting && (
                            <span className="text-blue-600 animate-pulse">Uploading...</span>
                          )}
                        </div>
                        {isSubmitting && Object.entries(uploadProgress).map(([name, progress]) => (
                          <div key={name} className="space-y-1">
                            <div className="flex justify-between text-[10px] text-neutral-500">
                              <span className="truncate max-w-[200px]">{name}</span>
                              <span>{Math.round(progress as number)}%</span>
                            </div>
                            <div className="w-full bg-neutral-100 rounded-full h-1">
                              <div 
                                className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                                style={{ width: `${progress as number}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 pt-4 pb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdding(false);
                        setEditingPlotId(null);
                        setNewPlotPos(null);
                        setLocationInput('');
                      }}
                      className="flex-1 px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !newPlotPos}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Saving...' : (editingPlotId ? 'Update Plot' : 'Save Plot')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
          <Map
            defaultCenter={{ lat: 23.0225, lng: 72.5714 }}
            defaultZoom={13}
            onClick={handleMapClick}
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {/* Existing Plots */}
            {filteredPlots.map((plot) => (
              <Marker
                key={plot.id}
                position={{ lat: plot.lat, lng: plot.lng }}
                onClick={() => setSelectedPlot(plot)}
              />
            ))}

            {/* Selected Plot InfoWindow */}
            {selectedPlot && (
              <InfoWindow
                position={{ lat: selectedPlot.lat, lng: selectedPlot.lng }}
                onCloseClick={() => setSelectedPlot(null)}
              >
                <div className="p-1 min-w-[200px] max-w-[250px]">
                  {selectedPlot.societyName && (
                    <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                      {selectedPlot.societyName} {selectedPlot.unitNumber ? `- ${selectedPlot.unitNumber}` : ''}
                    </h4>
                  )}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedPlot.locality && (
                      <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <MapPin size={8} /> {selectedPlot.locality}
                      </span>
                    )}
                    {selectedPlot.propertyTag && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        selectedPlot.propertyTag === 'Owner' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        {selectedPlot.propertyTag}
                      </span>
                    )}
                    {selectedPlot.size && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                        {selectedPlot.size} {selectedPlot.sizeUnit}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-lg mb-1">{selectedPlot.contactName || 'Unknown Contact'}</h3>
                  <p className="text-neutral-600 mb-3">{selectedPlot.contactNumber || 'No Number'}</p>
                  <div className="bg-neutral-50 p-3 rounded-lg mb-3">
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap">{selectedPlot.details}</p>
                  </div>
                  
                  {selectedPlot.documents && selectedPlot.documents.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-neutral-500 uppercase mb-2">Documents</h4>
                      <ul className="space-y-1">
                        {selectedPlot.documents.map((doc, i) => (
                          <li key={i}>
                            <a 
                              href={doc.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <FileText size={14} />
                              {doc.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => startEditing(selectedPlot)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-100 transition-colors"
                    >
                      <Edit size={14} /> Edit
                    </button>
                    <button
                      onClick={() => copyShareLink(selectedPlot.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-neutral-900 text-white rounded-md text-sm font-medium hover:bg-neutral-800 transition-colors"
                    >
                      {copiedId === selectedPlot.id ? <Check size={14} /> : <Share2 size={14} />}
                      {copiedId === selectedPlot.id ? 'Copied' : 'Share'}
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}

            {/* New Plot Marker */}
            {newPlotPos && (
              <Marker 
                position={newPlotPos} 
                draggable={true}
                onDragEnd={(e) => {
                  if (e.latLng) {
                    const lat = typeof e.latLng.lat === 'function' ? e.latLng.lat() : e.latLng.lat;
                    const lng = typeof e.latLng.lng === 'function' ? e.latLng.lng() : e.latLng.lng;
                    setNewPlotPos({ lat, lng });
                    setLocationInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                  }
                }}
              />
            )}
          </Map>
        </APIProvider>
        
        {isAdding && !newPlotPos && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white px-6 py-3 rounded-full shadow-lg border border-blue-200 text-blue-800 font-medium z-[1000] flex items-center gap-2 animate-bounce pointer-events-none">
            <MapPin size={20} />
            Click map or paste link to place pin
          </div>
        )}
      </div>

      {/* Team Management Modal */}
      {showTeamModal && userRole === 'admin' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <Users className="text-blue-600" size={20} />
                Team Management
              </h2>
              <button 
                onClick={() => setShowTeamModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-md"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 border-b border-neutral-200">
              <form onSubmit={handleAddTeamMember} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={newTeamEmail}
                  onChange={(e) => setNewTeamEmail(e.target.value)}
                  placeholder="team@example.com"
                  className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                <select
                  value={newTeamRole}
                  onChange={(e) => setNewTeamRole(e.target.value as 'admin' | 'member')}
                  className="px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={isAddingTeamMember}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-70 flex items-center gap-1 text-sm font-medium"
                >
                  <Plus size={16} /> Add
                </button>
              </form>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                Authorized Members
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">nileshhirpara811@gmail.com</p>
                    <p className="text-xs text-neutral-500">Primary Admin</p>
                  </div>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">Admin</span>
                </div>
                
                {teamMembers.map(member => (
                  <div key={member.id} className="flex justify-between items-center p-3 bg-white border border-neutral-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{member.email}</p>
                      <p className="text-xs text-neutral-500">Added by {member.addedBy}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${member.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-700'}`}>
                        {member.role === 'admin' ? 'Admin' : 'Member'}
                      </span>
                      <button
                        onClick={() => handleRemoveTeamMember(member.email)}
                        className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove Member"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
