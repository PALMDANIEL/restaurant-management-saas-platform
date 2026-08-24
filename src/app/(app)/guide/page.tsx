"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ShoppingCart,
  UtensilsCrossed,
  Wallet,
  Boxes,
  Store,
  Users,
  Star,
  CalendarClock,
  Truck,
  Receipt,
  BarChart3,
  Bot,
  QrCode,
  Landmark,
  Building2,
  ScrollText,
  Settings,
  ChevronDown,
  Layers,
} from "lucide-react";

type Section = { icon: typeof BookOpen; title: string; content: string[] };
type Group = { title: string; sections: Section[] };

const GROUPS: Group[] = [
  {
    title: "Vente au quotidien",
    sections: [
      {
        icon: Wallet,
        title: "Caisse — à faire en premier chaque jour",
        content: [
          "Ouvre une session de caisse en début de service, avec le montant réel en espèces présent au tiroir (le fond de départ).",
          "⚠️ Dépendance importante : tant qu'aucune session n'est ouverte, le bouton « Encaisser » du Point de vente et de Commandes reste désactivé. C'est volontaire — ça empêche d'enregistrer une vente sans savoir dans quelle caisse l'argent doit être compté.",
          "En fin de service, clique sur « Clôturer la caisse » et compte l'argent réellement présent. L'app calcule automatiquement le montant attendu (fond de départ + toutes les ventes en espèces enregistrées sur cette session) et affiche l'écart.",
          "Un écart positif veut dire plus d'argent que prévu (souvent une erreur de rendu de monnaie en ta faveur) ; un écart négatif signale un manque à vérifier avec l'équipe.",
          "L'historique des sessions clôturées reste consultable en bas de la page — utile pour repérer des écarts récurrents dus à une même personne ou un même service.",
        ],
      },
      {
        icon: ShoppingCart,
        title: "Point de vente (POS) — encaisser une vente",
        content: [
          "Recherche ou filtre les produits par catégorie, clique dessus pour les ajouter au panier.",
          "Choisis une table si le client est sur place (la liste vient de l'écran QR Codes tables), ou laisse « Sans table » pour une vente à emporter/au comptoir.",
          "Assigne une serveuse si quelqu'un du service s'occupe de la table — c'est ce qui alimente ensuite son score de performance automatique (voir Serveuses).",
          "Deux façons de valider : « Envoyer en cuisine » crée la commande sans l'encaisser (statut « Nouvelle », visible dans Commandes pour la suite du service) ; « Encaisser » facture immédiatement (nécessite une caisse ouverte, voir ci-dessus).",
          "→ Implication directe sur le Stock : chaque produit vendu déduit automatiquement la quantité correspondante du stock, produit par produit, immédiatement à la validation.",
          "→ Implication sur les Clients & Fidélité : si tu relies la vente à un client, ses points de fidélité s'accumulent automatiquement.",
        ],
      },
      {
        icon: UtensilsCrossed,
        title: "Commandes — suivi cuisine et service",
        content: [
          "Toutes les commandes créées depuis le POS, la page Commandes elle-même, ou la commande client par QR code (voir plus bas) apparaissent ici, quel que soit leur point d'origine.",
          "Fais progresser le statut dans l'ordre : Nouvelle → En préparation → Servie → Encaissée. Chaque commande affiche qui la sert (serveuse assignée) et peut être réassignée directement depuis cette page si besoin.",
          "⚠️ Le moment exact où une commande passe à « Servie » est enregistré automatiquement en arrière-plan — c'est cette donnée, invisible à l'œil, qui sert ensuite à calculer objectivement la rapidité de service de chaque serveuse (voir Serveuses).",
          "Encaisser depuis cette page fonctionne comme au POS : il faut une session de caisse ouverte, et il faut choisir laquelle si plusieurs sont ouvertes (rare, mais possible sur plusieurs points de vente).",
          "Annuler une commande remet automatiquement en stock les produits qui avaient été déduits — le Stock reste donc toujours exact même en cas d'erreur de saisie.",
        ],
      },
      {
        icon: QrCode,
        title: "QR Codes tables & commande client autonome",
        content: [
          "Crée d'abord tes tables ici (numéro + capacité) — elles apparaissent ensuite automatiquement dans les sélecteurs de table du POS et des Réservations.",
          "Active « Commande par QR code » pour ce point de vente : c'est un interrupteur global, obligatoire pour que la page de commande client fonctionne (sinon elle affiche une erreur si un client scanne le QR).",
          "Télécharge ou imprime le QR généré pour chaque table et colle-le physiquement dessus.",
          "Le client scanne, voit le menu (uniquement les produits actifs et en stock), compose son panier et envoie sa commande sans app ni compte à créer.",
          "→ Implication : cette commande client arrive directement dans Commandes avec le statut « Nouvelle » et la mention de la table — elle suit exactement le même circuit qu'une commande prise par le personnel, stock déduit compris.",
        ],
      },
    ],
  },
  {
    title: "Catalogue, stock & approvisionnement",
    sections: [
      {
        icon: Store,
        title: "Produits & Catégories",
        content: [
          "C'est ici que tu définis ton menu : nom, prix de vente, prix de revient (coût), catégorie, unité, et le seuil d'alerte de stock bas.",
          "Le prix de revient n'est pas juste informatif : il sert à calculer la marge brute affichée dans Rapports & Finances (prix de vente − prix de revient, sur chaque vente).",
          "Un produit désactivé disparaît du Point de vente et de la commande client par QR, mais reste visible dans l'historique des ventes passées.",
          "Le seuil d'alerte que tu définis ici détermine quand un produit apparaît comme « en stock bas » dans Stock et dans les réponses de l'Assistant IA.",
        ],
      },
      {
        icon: Boxes,
        title: "Stock",
        content: [
          "Vue d'ensemble des quantités actuelles, avec mise en évidence des produits sous leur seuil d'alerte.",
          "Le stock ne se modifie jamais manuellement au jour le jour dans le flux normal — il évolue automatiquement via trois sources : une vente (POS/Commandes, qui le diminue), une réception de commande fournisseur (qui l'augmente), ou une annulation de commande (qui le restaure).",
          "Chaque mouvement est tracé individuellement (type, quantité, raison, référence à la commande ou à la commande fournisseur d'origine), consultable pour comprendre une variation inattendue.",
        ],
      },
      {
        icon: Truck,
        title: "Fournisseurs",
        content: [
          "Enregistre tes fournisseurs habituels (contact, téléphone) une fois pour toutes.",
          "Crée une commande fournisseur en listant les articles, quantités et coûts unitaires — ça permet de suivre ce qui est en attente de livraison et le montant total engagé.",
          "⚠️ Étape clé : marquer une commande comme « Reçue » n'est pas juste cosmétique — ça déclenche automatiquement l'augmentation du Stock pour chaque article de la commande, exactement comme si tu l'avais saisi manuellement dans Stock. Ne marque « Reçue » que lorsque la marchandise est physiquement arrivée.",
        ],
      },
    ],
  },
  {
    title: "Clients",
    sections: [
      {
        icon: Users,
        title: "Clients & Fidélité",
        content: [
          "Crée une fiche client (nom, téléphone) pour suivre son historique et ses points de fidélité au fil du temps.",
          "1 point est attribué automatiquement pour chaque tranche de 500 FCFA dépensée lors d'une vente reliée au client ; tu peux aussi attribuer ou utiliser des points manuellement (ex: geste commercial).",
          "Le palier affiché (Bronze / Argent / Or) est calculé automatiquement à partir du total dépensé depuis la création de la fiche — aucune action manuelle requise.",
          "L'historique des points (gagnés, utilisés, ajustements) est conservé intégralement pour chaque client, consultable depuis sa fiche.",
        ],
      },
      {
        icon: CalendarClock,
        title: "Réservations",
        content: [
          "Enregistre une réservation avec nom du client, nombre de personnes, date/heure, et optionnellement une table (liste tirée de QR Codes tables).",
          "Fais évoluer le statut le jour J : en attente → confirmée → installée → terminée, pour garder une vue claire de qui est attendu et qui est déjà arrivé.",
          "Une réservation n'est pas automatiquement liée à une commande — une fois le client installé, la vente se prend normalement via le Point de vente en sélectionnant la même table.",
        ],
      },
    ],
  },
  {
    title: "Finances",
    sections: [
      {
        icon: Receipt,
        title: "Dépenses",
        content: [
          "Enregistre toutes tes charges (loyer, salaires, électricité, transport, maintenance...) par catégorie et par date.",
          "Consulte le total du mois en cours et la répartition par catégorie pour repérer les postes qui pèsent le plus.",
          "→ Implication directe : ces dépenses sont automatiquement soustraites de la marge brute des ventes dans Rapports & Finances pour calculer le résultat net réel de ton activité — ne les néglige pas, elles changent complètement la lecture de ta rentabilité.",
        ],
      },
      {
        icon: BarChart3,
        title: "Rapports & Finances",
        content: [
          "Vue d'ensemble du mois en cours : chiffre d'affaires (somme des ventes encaissées), marge brute (ventes moins coût de revient des produits vendus), dépenses enregistrées, et résultat net (marge brute − dépenses).",
          "Le graphique d'évolution du CA et le classement des produits les plus vendus se basent sur les 30 derniers jours de ventes encaissées (statut « Payée/Encaissée » uniquement — une commande juste « servie » sans paiement n'est pas encore comptée).",
          "Cette page ne modifie rien : elle agrège en lecture seule les données déjà saisies via POS/Commandes (ventes) et Dépenses (charges).",
        ],
      },
    ],
  },
  {
    title: "Équipe",
    sections: [
      {
        icon: Star,
        title: "Serveuses — score de performance automatique",
        content: [
          "Liste de l'équipe de service en salle, avec un score sur 100 calculé chaque mois **uniquement** à partir de l'exécution réelle des commandes — aucune note manuelle n'existe dans l'app.",
          "Le score combine : le taux de commandes menées à terme (servies/encaissées plutôt qu'annulées), la rapidité moyenne entre la création de la commande et le moment où elle est marquée « Servie », et une pénalité liée au taux d'annulation.",
          "⚠️ Ce score dépend entièrement de deux habitudes en amont : assigner systématiquement une serveuse à chaque commande (au POS ou dans Commandes), et faire progresser le statut jusqu'à « Servie » au bon moment plutôt que de sauter directement à « Encaissée ». Sans ça, les données sont incomplètes et le score reste marqué « Pas assez de données ».",
          "Un minimum de 3 commandes résolues dans le mois est nécessaire avant qu'un score s'affiche, pour éviter de juger sur un échantillon trop faible.",
        ],
      },
      {
        icon: Users,
        title: "Utilisateurs",
        content: [
          "Gestion complète des comptes de l'équipe : email, rôle (gérant, manager, caissier, serveuse...), points de vente auxquels la personne a accès, activation/désactivation.",
          "Différence avec l'écran Serveuses : Utilisateurs gère tous les rôles avec les droits complets (création, changement de rôle) ; Serveuses est une vue simplifiée réservée à la gestion du personnel de salle, accessible aussi aux managers qui n'ont pas forcément le droit de gérer l'ensemble du personnel.",
          "Désactiver un compte plutôt que le supprimer conserve son historique (ventes, commandes servies) intact pour les rapports et le journal d'audit.",
        ],
      },
    ],
  },
  {
    title: "Administration",
    sections: [
      {
        icon: Landmark,
        title: "Maquis (points de vente)",
        content: [
          "Gère les différents points de vente de ton entreprise (nom, adresse, téléphone) si tu en as plusieurs.",
          "Le sélecteur de point de vente en haut de l'app (ou « Tous ») filtre les données affichées sur quasiment tous les écrans : ventes, stock, commandes, dépenses, etc. sont tous rattachés à un point de vente précis.",
        ],
      },
      {
        icon: Building2,
        title: "Entreprises",
        content: [
          "Réservé au super-administrateur : informations générales de l'entreprise (nom, devise, identité visuelle) qui chapeaute tous les points de vente.",
        ],
      },
      {
        icon: ScrollText,
        title: "Journal d'audit",
        content: [
          "Trace en lecture seule toutes les actions sensibles effectuées dans l'app : qui a créé/modifié/supprimé quoi, et quand — commandes, dépenses, utilisateurs, fournisseurs, points de fidélité, etc.",
          "Utile pour retrouver l'origine d'un changement inattendu (ex: un prix modifié, une commande annulée) sans avoir à demander à toute l'équipe.",
        ],
      },
      {
        icon: Settings,
        title: "Paramètres",
        content: [
          "Ton profil personnel (nom, téléphone, mot de passe) — indépendant du point de vente sélectionné.",
          "Réglages du point de vente actif (nom, adresse, téléphone) si tu as les droits de gestion — mêmes informations que dans l'écran Maquis, accessibles ici en raccourci.",
        ],
      },
    ],
  },
  {
    title: "Autres",
    sections: [
      {
        icon: Bot,
        title: "Assistant IA",
        content: [
          "Répond à des questions business en interrogeant tes vraies données en direct : chiffre d'affaires du jour/mois, produits les plus vendus, stock bas, dépenses, meilleurs clients, résultat net, état de la caisse.",
          "Pour les questions qui ne correspondent à aucune de ces catégories reconnues, l'assistant tente de répondre via un modèle de langage local (Ollama, si configuré sur ton serveur) en lui fournissant un résumé de tes données réelles — sinon, il propose les questions qu'il sait traiter avec certitude.",
          "Il ne modifie jamais rien : c'est un outil de lecture et d'analyse, pas d'action.",
        ],
      },
    ],
  },
];

export default function GuidePage() {
  const [openKey, setOpenKey] = useState<string | null>("Vente au quotidien-0");
  const user = useAppStore((s) => s.user);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Guide d&apos;utilisation</h1>
          <p className="text-sm text-muted-foreground">
            {user?.firstName ? `Salut ${user.firstName} ! ` : ""}Tous les écrans de l&apos;application, en détail, avec leurs
            liens entre eux.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> {group.title}
            </div>
            {group.sections.map((s, i) => {
              const Icon = s.icon;
              const key = `${group.title}-${i}`;
              const open = openKey === key;
              return (
                <Card key={key}>
                  <button
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    onClick={() => setOpenKey(open ? null : key)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="font-medium">{s.title}</span>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <CardContent className="pt-0">
                      <ul className="ml-12 list-disc space-y-2 text-sm text-muted-foreground">
                        {s.content.map((line, j) => (
                          <li key={j}>{line}</li>
                        ))}
                      </ul>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
