import LoadsView from '../../components/LoadsView.jsx';
import { useStore } from '../../lib/store.jsx';

export default function Dispatch() {
  const { data } = useStore();
  // Your fleet's jobs; "Everyone" also shows loads still waiting on the board.
  return <LoadsView carrier scope={(l) => l.carrierId === data.me.companyId || l.status === 'requested'} />;
}
