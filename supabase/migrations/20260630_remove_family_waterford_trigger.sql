drop trigger if exists families_set_waterford_resident on sccs.families;
drop function if exists sccs.set_family_waterford_resident();

notify pgrst, 'reload schema';
