import React, { useState, useEffect } from 'react';
import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps';
import { Plot } from '../types';
import { MapPin, Upload, Share2, Check, FileText, LogOut, Edit, Trash2, Users, Plus, X } from 'lucide-react';
import { db, auth, storage } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { signOut } from 'firebase/auth';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDp7t8pm5AiaY5HdnegA9_csUIqlD3HXao';

export default function AdminDashboard() {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [newPlotPos, setNewPlotPos] = useState<{lat: number, lng: number} | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState('');
  
  // Form state
  const [societyName, setSocietyName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerNumber, setOwnerNumber] = useState('');
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
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
        return { ...plot, ...owner };
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

  const handleLocationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocationInput(val);
    
    // Try to parse coordinates from various Google Maps URL formats or raw lat/lng
    let match = val.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/search\/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) match = val.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    
    if (match) {
      setNewPlotPos({ lat: parseFloat(match[1]), lng: parseFloat(match[2]) });
    }
  };

  const startEditing = (plot: Plot) => {
    setIsAdding(true);
    setEditingPlotId(plot.id);
    setNewPlotPos({ lat: plot.lat, lng: plot.lng });
    setLocationInput(`${plot.lat.toFixed(6)}, ${plot.lng.toFixed(6)}`);
    setSocietyName(plot.societyName || '');
    setUnitNumber(plot.unitNumber || '');
    setOwnerName(plot.ownerName || '');
    setOwnerNumber(plot.ownerNumber || '');
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
    const plotId = editingPlotId || crypto.randomUUID();

    try {
      let documents = editingPlotId ? (plots.find(p => p.id === editingPlotId)?.documents || []) : [];
      
      if (files) {
        const uploadPromises = Array.from(files).map(async (file: File) => {
          const storageRef = ref(storage, `plots/${plotId}/${file.name}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          return { name: file.name, url };
        });
        
        const newDocs = await Promise.all(uploadPromises);
        documents = [...documents, ...newDocs];
      }

      const plotData = {
        lat: newPlotPos.lat,
        lng: newPlotPos.lng,
        societyName,
        unitNumber,
        details,
        documents,
        authorUid: editingPlotId ? (plots.find(p => p.id === editingPlotId)?.authorUid || auth.currentUser.uid) : auth.currentUser.uid
      };

      const ownerData = {
        ownerName,
        ownerNumber,
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
      setOwnerName('');
      setOwnerNumber('');
      setDetails('');
      setFiles(null);
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
        <div className="p-6 border-b border-neutral-200 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
              <MapPin className="text-blue-600" />
              Eezily R1/R2/R3 Plots Mapping
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Manage plots and client links</p>
          </div>
          <div className="flex items-center gap-1">
            {userRole === 'admin' && (
              <button 
                onClick={() => setShowTeamModal(true)}
                className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Team Settings"
              >
                <Users size={20} />
              </button>
            )}
            <button 
              onClick={() => signOut(auth)}
              className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
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
                  setOwnerName('');
                  setOwnerNumber('');
                  setDetails('');
                  setFiles(null);
                }}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                + Add New Plot
              </button>

              <div className="mt-8">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                  Saved Plots ({plots.length})
                </h2>
                <div className="space-y-3">
                  {plots.map((plot) => (
                    <div key={plot.id} className="p-4 rounded-xl border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-neutral-900">
                            {plot.societyName ? `${plot.societyName} - ${plot.unitNumber || ''}` : (plot.ownerName || 'Unnamed Plot')}
                          </h3>
                          {plot.societyName && (
                            <p className="text-xs text-neutral-500 font-medium">{plot.ownerName}</p>
                          )}
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
                      <p className="text-sm text-neutral-600 mb-1">{plot.ownerNumber || 'No Number'}</p>
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
                    <input
                      type="text"
                      value={locationInput}
                      onChange={handleLocationInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Paste Google Maps link or click on map"
                    />
                    {newPlotPos ? (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <Check size={12} /> Location set ({newPlotPos.lat.toFixed(4)}, {newPlotPos.lng.toFixed(4)})
                      </p>
                    ) : (
                      <p className="text-xs text-neutral-500 mt-1">
                        Required: Click map to drop pin, or paste a map link.
                      </p>
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
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Unit Number</label>
                    <input
                      type="text"
                      value={unitNumber}
                      onChange={(e) => setUnitNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Enter unit number (e.g. B-204)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Owner Name</label>
                    <input
                      required
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Owner Number</label>
                    <input
                      required
                      type="text"
                      value={ownerNumber}
                      onChange={(e) => setOwnerNumber(e.target.value)}
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
                      <div className="mt-2 text-sm text-neutral-600">
                        {files.length} file(s) selected
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
            {plots.map((plot) => (
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
                  <h3 className="font-bold text-lg mb-1">{selectedPlot.ownerName || 'Unknown Owner'}</h3>
                  <p className="text-neutral-600 mb-3">{selectedPlot.ownerNumber || 'No Number'}</p>
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
