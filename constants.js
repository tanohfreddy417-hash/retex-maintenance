// Référentiels partagés (back-end + exposés au front via /api/config)

// Types d'équipement — sert de base à la comparaison inter-usines.
const TYPES_EQUIPEMENT = [
  'Pompe',
  'Moteur électrique',
  'Convoyeur / Tapis',
  'Presse hydraulique',
  'Séchoir / Ventilateur',
  'Broyeur / Shredder',
  'Crêpeuse',
  'Calandre',
  'Prébreaker / Slab cutter',
  'Tamis / Agitateur / Batteur',
  'Élévateur / Avance-panier',
  'Armoire électrique / Automatisme',
  'Groupe électrogène',
  'Chariot élévateur / Engin',
  'Instrumentation / Capteur',
  'Réseau air comprimé / Hydraulique',
  'Chaudière / Utilités',
  'Autre'
];

const CRITICITES = ['Faible', 'Moyenne', 'Haute', 'Critique'];

module.exports = { TYPES_EQUIPEMENT, CRITICITES };
