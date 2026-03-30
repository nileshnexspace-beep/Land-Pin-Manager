import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps';
import { Plot } from '../types';
import { MapPin, FileText, Info } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDp7t8pm5AiaY5HdnegA9_csUIqlD3HXao';

export default function SharedPlotView() {
  const { id } = useParams<{ id: string }>();
  const [plot, setPlot] = useState<Partial<Plot> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(true);

  useEffect(() => {
    const fetchPlot = async () => {
      try {
        if (!id) return;
        const docRef = doc(db, 'plots', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setPlot(docSnap.data() as Partial<Plot>);
        } else {
          setError('Plot not found or link is invalid.');
        }
      } catch (err) {
        setError('Failed to load plot details.');
      } finally {
        setLoading(false);
      }
    };

    fetchPlot();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !plot) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <MapPin className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
          <h2 className="text-xl font-semibold text-neutral-900 mb-2">Plot Not Found</h2>
          <p className="text-neutral-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-neutral-50">
      {/* Details Panel */}
      <div className="w-full md:w-96 bg-white border-r border-neutral-200 flex flex-col shadow-sm z-10 order-2 md:order-1">
        <div className="p-6 border-b border-neutral-200 bg-blue-600 text-white">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="text-white opacity-80" />
            Land Details
          </h1>
          <p className="text-sm text-blue-100 mt-1">Shared Property Information</p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Info size={16} />
                Property Description
              </h2>
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                <p className="text-neutral-700 whitespace-pre-wrap leading-relaxed">
                  {plot.details}
                </p>
              </div>
            </div>

            {plot.documents && plot.documents.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText size={16} />
                  Available Documents
                </h2>
                <ul className="space-y-2">
                  {plot.documents.map((doc, i) => (
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
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0 order-1 md:order-2 h-[50vh] md:h-auto">
        {plot.lat && plot.lng && (
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
            <Map
              defaultCenter={{ lat: plot.lat, lng: plot.lng }}
              defaultZoom={15}
              disableDefaultUI={false}
              className="w-full h-full"
            >
              <Marker 
                position={{ lat: plot.lat, lng: plot.lng }} 
                onClick={() => setShowInfo(true)}
              />
              {showInfo && (
                <InfoWindow
                  position={{ lat: plot.lat, lng: plot.lng }}
                  onCloseClick={() => setShowInfo(false)}
                >
                  <div className="font-medium text-center p-1">Property Location</div>
                </InfoWindow>
              )}
            </Map>
          </APIProvider>
        )}
      </div>
    </div>
  );
}
