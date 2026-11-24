/**
 * Les polices et les mesures de texte : Fabric mémorise la largeur de chaque caractère par
 * famille (`cache.charWidthsCache`). Une mesure prise avant l'arrivée de la police — un texte
 * rendu en attendant, avec une police de repli — resterait fausse pour toute la page : la
 * largeur « hug » d'un texte (mesurée sur la ligne) et son retour à la ligne (mot par mot)
 * ne s'accordent plus, et le dernier mot passe à la ligne. Une police qui arrive oublie donc
 * ses mesures. Exposé par la lib : l'hôte et elle ne partagent pas forcément la même copie
 * de Fabric.
 */
import { cache } from "#fabric";

export function forgetFontMeasures(family: string): void {
  cache.clearFontCache(family);
}
