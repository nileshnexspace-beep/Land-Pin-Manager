export interface Plot {
  id: string;
  lat: number;
  lng: number;
  ownerName: string;
  ownerNumber: string;
  details: string;
  documents: { name: string; url: string }[];
}
