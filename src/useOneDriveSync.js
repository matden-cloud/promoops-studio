import { useCallback, useEffect, useRef, useState } from 'react';
import { ONEDRIVE_TARGETS } from '../server/onedrive-plan.js';
import { createSyncRun } from './syncRun.js';

const TARGETS = [ONEDRIVE_TARGETS.final, ONEDRIVE_TARGETS.mentahan];

export function useOneDriveSync(onSynced) {
  const onSyncedRef = useRef(onSynced);
  const [run] = useState(() => createSyncRun({ targets: TARGETS }));
  const [state, setState] = useState(() => run.snapshot());

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    let alive = true;
    const unsubscribe = run.subscribe((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [run]);

  const startSync = useCallback((targetId) => {
    run.start(targetId, {
      onSynced: () => onSyncedRef.current?.(),
    });
  }, [run]);

  const dismissChangelog = useCallback(() => {
    run.dismiss();
  }, [run]);

  return {
    ...state,
    syncing: Boolean(state.running),
    startSync,
    dismissChangelog,
  };
}
