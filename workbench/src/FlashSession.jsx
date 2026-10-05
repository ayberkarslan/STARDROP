import EspConsole from './EspConsole.jsx';
import useFirmwareJob from './useFirmwareJob.js';

export default function FlashSession({ documentId, services, devicesOnly = false }) {
  const job = useFirmwareJob({ documentId, ...services });
  return <EspConsole {...services} {...job} documentId={documentId} devicesOnly={devicesOnly} />;
}
