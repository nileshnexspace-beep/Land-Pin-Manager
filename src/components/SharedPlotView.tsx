import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps';
import { Plot } from '../types';
import { MapPin, FileText, Info, ExternalLink } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import Logo from './Logo';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDp7t8pm5AiaY5HdnegA9_csUIqlD3HXao';

export default function SharedPlotView() {
  const { id } = useParams<{ id: string }>();
  const [plots, setPlots] = useState<Partial<Plot>[]>([]);
  const [selectedPlot, setSelectedPlot] = useState<Partial<Plot> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);

  useEffect(() => {
    const fetchPlots = async () => {
      try {
        if (!id) return;
        const ids = id.split(',');
        const fetchedPlots: Partial<Plot>[] = [];

        for (const plotId of ids) {
          const docRef = doc(db, 'plots', plotId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Fetch owner data too
            const ownerRef = doc(db, 'plot_owners', plotId);
            const ownerSnap = await getDoc(ownerRef);
            const ownerData = ownerSnap.exists() ? ownerSnap.data() : {};
            
            // Handle renamed fields
            const contactName = ownerData.contactName || ownerData.ownerName || '';
            const contactNumber = ownerData.contactNumber || ownerData.ownerNumber || '';
            
            fetchedPlots.push({ ...data, ...ownerData, id: plotId, contactName, contactNumber } as Partial<Plot>);
          }
        }

        if (fetchedPlots.length > 0) {
          setPlots(fetchedPlots);
          setSelectedPlot(fetchedPlots[0]);
        } else {
          setError('Plots not found or link is invalid.');
        }
      } catch (err) {
        setError('Failed to load plot details.');
      } finally {
        setLoading(false);
      }
    };

    fetchPlots();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || plots.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <MapPin className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Plots Not Found</h2>
          <p className="text-neutral-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-neutral-50">
      {/* Details Panel */}
      <div className="w-full md:w-96 bg-white border-r border-neutral-200 flex flex-col shadow-sm z-10 order-2 md:order-1">
        <div className="p-6 border-b border-neutral-200 bg-neutral-900 text-white">
          <Logo variant="light" className="mb-4" />
          
          {plots.length > 1 && (
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-neutral-500 uppercase mb-2">Select Plot to View</label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {plots.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlot(p)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      selectedPlot?.id === p.id 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white/10 text-neutral-400 hover:bg-white/20'
                    }`}
                  >
                    Plot {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedPlot && (
            <>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <MapPin className="text-orange-500" />
                {selectedPlot.societyName ? `${selectedPlot.societyName} - ${selectedPlot.unitNumber || ''}` : (selectedPlot.locality || 'Land Details')}
              </h1>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedPlot.locality && (
                  <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
                    {selectedPlot.locality}
                  </span>
                )}
                {selectedPlot.propertyTag && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    selectedPlot.propertyTag === 'Owner' ? 'bg-green-400/30 text-green-50' : 'bg-orange-400/30 text-orange-50'
                  }`}>
                    {selectedPlot.propertyTag}
                  </span>
                )}
                {selectedPlot.size && (
                  <span className="text-xs bg-blue-400/30 text-white px-2 py-0.5 rounded-full font-bold">
                    {selectedPlot.size} Sqyd
                  </span>
                )}
                {selectedPlot.pricePerSqyd && (
                  <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
                    ₹{selectedPlot.pricePerSqyd}/Sqyd
                  </span>
                )}
                {selectedPlot.totalPrice && (
                  <span className="text-xs bg-green-400/30 text-green-50 px-2 py-0.5 rounded-full font-bold">
                    Total: ₹{selectedPlot.totalPrice}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {selectedPlot && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Info size={16} />
                  Property Description
                </h2>
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                  <p className="text-neutral-700 whitespace-pre-wrap leading-relaxed">
                    {selectedPlot.details}
                  </p>
                </div>
              </div>

              {selectedPlot.documents && selectedPlot.documents.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileText size={16} />
                    Available Documents
                  </h2>
                  <ul className="space-y-2">
                    {selectedPlot.documents.map((doc, i) => (
                      <li key={i}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                        >
                          <div className="bg-blue-100 p-2 rounded-md group-hover:bg-blue-200 transition-colors">
                            <FileText size={20} className="text-blue-700" />
                          </div>
                          <span className="font-medium text-neutral-700 group-hover:text-blue-700 transition-colors truncate">
                            {doc.name}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="pt-4 border-t border-neutral-100">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">Contact Information</h2>
                <div className="bg-neutral-900 p-4 rounded-xl text-white">
                  <p className="font-bold">{selectedPlot.contactName}</p>
                  <p className="text-neutral-400 text-sm mb-3">{selectedPlot.contactNumber}</p>
                  <a 
                    href={`https://wa.me/${selectedPlot.contactNumber?.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-bold transition-colors"
                  >
                    Contact on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0 order-1 md:order-2 h-[50vh] md:h-auto">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
          <Map
            center={selectedPlot?.lat && selectedPlot?.lng ? { lat: selectedPlot.lat, lng: selectedPlot.lng } : { lat: 23.0225, lng: 72.5714 }}
            defaultZoom={15}
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {plots.map((p) => (
              p.lat && p.lng && (
                <Marker 
                  key={p.id}
                  position={{ lat: p.lat, lng: p.lng }} 
                  onClick={() => {
                    setSelectedPlot(p);
                    setShowInfo(true);
                  }}
                  icon={selectedPlot?.id === p.id ? undefined : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'}
                />
              )
            ))}
            
            {showInfo && selectedPlot?.lat && selectedPlot?.lng && (
              <InfoWindow
                position={{ lat: selectedPlot.lat, lng: selectedPlot.lng }}
                onCloseClick={() => setShowInfo(false)}
              >
                <div className="font-medium p-1 min-w-[150px]">
                  <div className="font-bold text-blue-600 mb-1">
                    {selectedPlot.societyName || selectedPlot.locality || 'Property'}
                  </div>
                  <div className="text-xs text-neutral-600">
                    {selectedPlot.size} Sqyd • ₹{selectedPlot.totalPrice}
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
