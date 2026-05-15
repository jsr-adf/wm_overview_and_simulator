import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../lib/supabase';

export function useFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dbReady, setDbReady] = useState(false);

  // Load favorites from database
  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      setLoading(false);
      setDbReady(false);
      return;
    }

    async function loadFavorites() {
      try {
        setLoading(true);
        const { data, error: err } = await supabase
          .from('favorites')
          .select('team_id')
          .eq('user_id', user.id);

        if (err) {
          // If table doesn't exist yet, just use local state
          if (err.code === 'PGRST116' || err.message?.includes('does not exist')) {
            console.log('Favorites table not yet created. Using local state.');
            setDbReady(false);
          } else {
            throw err;
          }
        } else {
          setFavorites(new Set(data?.map(f => f.team_id) || []));
          setDbReady(true);
        }
        setError(null);
      } catch (err) {
        console.error('Error loading favorites:', err);
        setError(err.message);
        setDbReady(false);
      } finally {
        setLoading(false);
      }
    }

    loadFavorites();
  }, [user]);

  const toggleFavorite = async (teamId) => {
    if (!user) return;

    const isFavorite = favorites.has(teamId);
    const newFavorites = new Set(favorites);

    if (isFavorite) {
      newFavorites.delete(teamId);
    } else {
      newFavorites.add(teamId);
    }

    setFavorites(newFavorites);

    // If database isn't ready, just use local state
    if (!dbReady) {
      console.log('Database not ready, storing favorite in local state only');
      return;
    }

    try {
      if (isFavorite) {
        const { error: err } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('team_id', teamId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('favorites')
          .insert({ user_id: user.id, team_id: teamId });
        if (err) throw err;
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
      // Revert on error
      setFavorites(favorites);
      setError(err.message);
    }
  };

  return { favorites, toggleFavorite, loading, error };
}
