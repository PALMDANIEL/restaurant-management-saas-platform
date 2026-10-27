"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Rocket,
  ShieldCheck,
  Smartphone,
  Ticket,
  WifiOff,
  Clock,
  SlidersHorizontal,
  History,
  Search,
  ArrowRight,
} from "lucide-react";

type Section = { icon: typeof BookOpen; title: string; href?: string; content: string[] };
type Group = { title: string; sections: Section[] };

const GROUPS: Group[] = [
  {
    title: "Bien démarrer",
    sections: [
      {
        icon: Rocket,
        title: "Premiers pas — dans quel ordre tout installer",
        content: [
          "1. Maquis : vérifie le nom, l'adresse et le téléphone de chaque point de vente (ils apparaissent sur les reçus).",
          "2. Produits & Catégories : crée ton menu avec prix de vente, prix de revient et stock de départ.",
          "3. QR Codes tables : crée les tables (numéro, nombre de places).",
          "4. Utilisateurs : crée les comptes de l'équipe (gérant, manager, caissier, serveuses) et donne à chacun accès au bon point de vente.",
          "5. Serveuses : range chaque serveuse dans l'équipe du matin ou du soir, puis règle les horaires des deux équipes (bouton « Horaires »).",
          "6. Paramètres → Paiement LigdiCash (propriétaire uniquement) : si tu veux encaisser par QR code Orange Money / Moov Money.",
          "7. Chaque jour : ouvre la caisse avant la première vente, pointe les arrivées, et en fin de service clôture la caisse et remplis les fiches de comportement.",
        ],
      },
      {
        icon: ShieldCheck,
        title: "Qui peut faire quoi (les rôles)",
        href: "/users",
        content: [
          "Propriétaire (Super Administrateur) : accès à tout, y compris le compte LigdiCash de l'entreprise et tous les points de vente.",
          "Gérant : gère les points de vente, le menu, les comptes, les règles de notation des serveuses ; voit les rapports et le journal d'audit. Ne voit pas les clés LigdiCash.",
          "Manager : fait tourner le service — caisse, stock, fournisseurs, dépenses, serveuses (pointage, corrections d'heures, fiches de comportement). Voit les règles de notation sans pouvoir les changer.",
          "Caissier : point de vente, commandes, caisse, clients, avoirs, réservations.",
          "Serveuse : prend et fait avancer les commandes. Elle ne voit ni la caisse, ni les notes des autres.",
          "Chaque personne ne voit que les points de vente auxquels son compte est rattaché (écran Utilisateurs).",
        ],
      },
    ],
  },
  {
    title: "Vente au quotidien",
    sections: [
      {
        icon: Wallet,
        title: "Caisse — à faire en premier chaque jour",
        href: "/cash-register",
        content: [
          "Ouvre une session de caisse en début de service, avec le montant réel en espèces présent au tiroir (le fond de départ).",
          "⚠️ Tant qu'aucune session n'est ouverte, le bouton « Encaisser » du Point de vente et de Commandes reste désactivé : on sait toujours dans quelle caisse l'argent doit être compté.",
          "En fin de service, clique sur « Clôturer la caisse » et compte l'argent réellement présent. L'app calcule le montant attendu (fond de départ + ventes en espèces de la session) et affiche l'écart.",
          "Seules les espèces comptent dans ce calcul : la carte, le Mobile Money, LigdiCash et les avoirs n'arrivent pas dans le tiroir.",
          "Un écart positif = plus d'argent que prévu (souvent une erreur de monnaie) ; un écart négatif = un manque à vérifier avec l'équipe.",
        ],
      },
      {
        icon: ShoppingCart,
        title: "Point de vente — encaisser une vente",
        href: "/pos",
        content: [
          "Touche les produits pour les ajouter au panier ; + et − changent la quantité.",
          "Choisis une table (ou « Sans table » pour l'emporter) et la serveuse qui s'occupe du client : c'est ce qui compte ses ventes dans sa note du jour.",
          "« Cuisine » envoie la commande sans l'encaisser (elle apparaît dans Commandes) ; « Encaisser » règle tout de suite (caisse ouverte obligatoire).",
          "Moyens de paiement : Espèces, Carte, Mobile Money (paiement reçu sur un téléphone, vérifié à la main), LigdiCash · QR (paiement automatique, voir plus bas) et Paiement mixte.",
          "Espèces : saisis le montant tendu par le client, l'app affiche la monnaie à rendre. S'il manque de la monnaie en caisse, choisis « Émettre un avoir » : le client repart avec un bon du montant de sa monnaie.",
          "Un client qui présente un avoir : tape son code (AV-XXXXXX) puis « Vérifier » ; le montant est déduit et seul le reste est à payer.",
          "→ Le stock baisse automatiquement à la validation ; si un client est relié à la vente, il gagne 1 point de fidélité par tranche de 500 FCFA.",
        ],
      },
      {
        icon: Smartphone,
        title: "Payer avec LigdiCash (Orange Money, Moov Money)",
        href: "/pos",
        content: [
          "Au Point de vente ou dans Commandes, choisis « LigdiCash · QR » puis « Encaisser » (ou « Confirmer »).",
          "Un QR code s'affiche avec le montant. Le client le scanne avec l'appareil photo de son téléphone, choisit Orange Money ou Moov Money et valide avec son code secret.",
          "L'écran se met à jour tout seul : dès que LigdiCash confirme, la fenêtre se ferme, la vente est réglée et le reçu indique « LigdiCash ».",
          "Pas d'appareil photo ? « Ouvrir la page de paiement » donne le même lien, à ouvrir sur le téléphone du client.",
          "Le client ne paie finalement pas ? Touche « Annuler » : la commande reste ouverte dans Commandes, à encaisser autrement.",
          "Avec un avoir : LigdiCash ne demande que le reste ; l'avoir n'est consommé qu'une fois le paiement confirmé.",
          "⚠️ Si un client paie une facture déjà abandonnée alors que la commande a été réglée autrement, l'app ne compte pas deux fois la vente : une notification « Paiement LigdiCash en trop » demande de le rembourser.",
          "⚠️ LigdiCash demande une connexion Internet, contrairement aux ventes en espèces qui peuvent attendre le retour du réseau.",
          "Mise en place (propriétaire) : Paramètres → Paiement LigdiCash. Colle la clé API et le jeton de ton compte marchand LigdiCash (ligdicash.com → ton projet → API). Laisse « Encaisser pour de vrai » décoché pour faire des essais sur le serveur de test de LigdiCash, puis coche-le. L'argent arrive directement sur ton compte marchand.",
        ],
      },
      {
        icon: UtensilsCrossed,
        title: "Commandes — suivi cuisine et service",
        href: "/orders",
        content: [
          "Toutes les commandes (Point de vente, Commandes, commande client par QR code) arrivent ici.",
          "Fais progresser le statut dans l'ordre : Nouvelle → En préparation → Servie → Encaissée. La serveuse assignée peut être changée ici.",
          "⚠️ L'heure exacte du passage à « Servie » est enregistrée : elle sert à mesurer la rapidité de service de chaque serveuse. Ne saute pas directement à « Encaissée ».",
          "« Encaisser » ouvre la même fenêtre de paiement qu'au Point de vente (espèces, avoir, LigdiCash…). Choisis la session de caisse si plusieurs sont ouvertes.",
          "Annuler une commande remet automatiquement les produits en stock.",
        ],
      },
      {
        icon: Ticket,
        title: "Avoirs — bons d'achat du client",
        href: "/credit-notes",
        content: [
          "Un avoir est un bon au nom du point de vente, avec un code (AV-XXXXXX) et un montant. Il remplace la monnaie quand la caisse en manque, ou sert de geste commercial.",
          "Il se crée automatiquement à l'encaissement (« Émettre un avoir ») ou à la main depuis cet écran.",
          "Il s'utilise au Point de vente ou dans Commandes, en tout ou en partie : le reste est conservé pour la fois suivante.",
          "Un avoir n'est valable que dans le point de vente qui l'a émis. Un avoir annulé ou épuisé est refusé.",
          "La liste montre pour chaque avoir son montant de départ, ce qui reste, et son état (actif, utilisé, annulé).",
        ],
      },
      {
        icon: QrCode,
        title: "QR Codes tables & commande client autonome",
        href: "/qr-codes",
        content: [
          "Crée tes tables ici (numéro + capacité) : elles apparaissent ensuite au Point de vente et dans Réservations.",
          "Active « Commande par QR code » pour ce point de vente, sinon la page de commande client affiche une erreur.",
          "Imprime le QR de chaque table et colle-le dessus. Le client scanne, voit le menu (produits actifs et en stock) et envoie sa commande sans compte à créer.",
          "→ La commande arrive dans Commandes avec la mention de la table, et suit le même circuit qu'une commande prise par le personnel.",
        ],
      },
      {
        icon: WifiOff,
        title: "Coupure d'Internet",
        content: [
          "Si le réseau tombe pendant une vente au Point de vente, la vente est gardée sur l'appareil et une bannière orange l'indique.",
          "Dès que la connexion revient, les ventes en attente sont envoyées automatiquement (bannière bleue pendant l'envoi).",
          "Si une vente est refusée à l'envoi (par exemple un produit épuisé entre-temps), un message le signale : ressaisis-la.",
          "⚠️ Le paiement LigdiCash, lui, a besoin du réseau au moment de payer.",
        ],
      },
    ],
  },
  {
    title: "Équipe de salle — serveuses",
    sections: [
      {
        icon: Star,
        title: "La page Serveuses en un coup d'œil",
        href: "/servers",
        content: [
          "Accessible au propriétaire, au gérant et au manager.",
          "En haut : le jour affiché (flèches pour changer de jour, ou touche la date) et l'équipe : Matin, Soir ou Toutes. À l'ouverture, l'équipe en service à cette heure-ci est choisie automatiquement.",
          "Le bandeau résume l'équipe : en service (ou présentes pour un jour passé), en retard, absentes, et fiches de comportement à remplir. Touche « À noter » pour ouvrir directement la prochaine fiche.",
          "Chaque fiche montre la note du jour sur 20 dans un anneau (vert à partir de 14, or de 10 à 14, rouge en dessous), les heures réelles d'arrivée et de départ, et trois barres : ventes, comportement, ponctualité.",
          "Le grand bouton propose l'action du moment : pointer l'arrivée, pointer le départ, ou noter le comportement. Le menu « … » permet de corriger les heures et de changer la serveuse d'équipe.",
          "Une serveuse sans équipe est signalée en haut : choisis Matin ou Soir pour pouvoir la pointer.",
          "La meilleure note de chaque équipe porte le badge « Meilleure note ».",
        ],
      },
      {
        icon: Clock,
        title: "Arrivées, départs et horaires",
        href: "/servers",
        content: [
          "Pointe l'arrivée quand la serveuse commence, et son départ quand elle rentre à la maison.",
          "Les horaires de chaque équipe se règlent avec le bouton « Horaires » (par exemple matin 07:00–19:00, soir 19:00–06:00). Le retard et le départ anticipé sont mesurés par rapport à ces horaires.",
          "Le service du soir qui finit après minuit compte pour la soirée où il a commencé ; une serveuse du matin arrivée très tôt compte pour le jour même.",
          "Oubli de pointage : menu « … » → « Corriger les heures ». Tu peux modifier l'arrivée ou le départ, ou ajouter un pointage oublié. Le motif est obligatoire et la correction est inscrite au journal d'audit (heures avant et après, et qui a corrigé).",
          "Sur un jour passé, une serveuse jamais dépointée est marquée « Départ non pointé » : saisis son heure réelle de départ plutôt que de la pointer maintenant.",
          "Une absente est une serveuse d'une équipe qui n'a ni pointé ni vendu de la journée, une fois la journée terminée.",
        ],
      },
      {
        icon: Star,
        title: "Fiche de comportement",
        href: "/servers",
        content: [
          "Chaque jour, un responsable note chaque serveuse présente sur les critères de comportement, de 1 à 5 étoiles : par défaut accueil et politesse, tenue, esprit d'équipe, rigueur, réactivité.",
          "Chaque étoile a un sens : 1 à reprendre, 2 insuffisant, 3 correct, 4 bien, 5 excellent. Un commentaire permet de noter des faits précis (félicitations, incident).",
          "La note de comportement sur 20 se calcule pendant que tu remplis la fiche. Tous les critères doivent être notés pour enregistrer.",
          "Une fiche peut être modifiée ou supprimée le jour même ou plus tard. On ne peut pas noter son propre comportement.",
        ],
      },
      {
        icon: BarChart3,
        title: "Comment est calculée la note du jour",
        href: "/servers",
        content: [
          "La note sur 20 combine trois éléments, avec les parts réglées dans « Règles de notation » (par défaut ventes 40 %, comportement 40 %, ponctualité 20 %).",
          "Ventes : la meilleure de l'équipe ce jour-là a 20 ; les autres sont notées par rapport à elle, moitié sur le nombre de ventes, moitié sur le montant (réglable). Le matin et le soir sont comparés séparément.",
          "Comportement : la moyenne des étoiles de la fiche, ramenée sur 20.",
          "Ponctualité : chacune part de 20. Au-delà de la tolérance (5 min par défaut), elle perd 1 point par tranche de 5 min de retard et 1 point par tranche de 10 min de départ anticipé. Exemple : 17 min de retard = 17/20.",
          "Tant que la fiche de comportement n'est pas remplie, ou que la serveuse est encore en service, la note est marquée « provisoire » et calculée sur ce qui est connu.",
          "⚠️ Pour que les ventes comptent, la serveuse doit être assignée à chaque commande (Point de vente ou Commandes).",
        ],
      },
      {
        icon: SlidersHorizontal,
        title: "Règles de notation (réglables)",
        href: "/servers",
        content: [
          "Bouton « Règles de notation » sur la page Serveuses (ou Paramètres → Notation des serveuses). Modifiable par le propriétaire et le gérant ; le manager peut les consulter.",
          "Composition de la note : trois curseurs liés. Quand tu en bouges un, les deux autres s'ajustent pour garder 100 %.",
          "Ventes : la part entre nombre de ventes et montant vendu.",
          "Ponctualité : la tolérance et le nombre de minutes qui coûtent un point, avec un exemple qui se met à jour.",
          "Critères de comportement : renommer, ajouter, réordonner, désactiver. Un critère déjà utilisé ne peut pas être effacé (l'historique en a besoin) : désactive-le.",
          "Un changement s'applique à partir d'aujourd'hui. Les notes des jours passés restent calculées avec les règles de l'époque.",
          "« Réglages par défaut » remet les valeurs d'origine.",
        ],
      },
      {
        icon: History,
        title: "Historique d'une serveuse",
        href: "/servers",
        content: [
          "Bouton « Historique » sur sa fiche : 7 jours, 30 jours ou 3 mois.",
          "En haut : note moyenne, comportement et ponctualité moyens, ventes, jours travaillés, heures, retards (nombre de jours et minutes cumulées) et absences.",
          "Une courbe montre l'évolution de la note, puis le détail jour par jour : heures, retard, ventes, étoiles de chaque critère et commentaire.",
          "On y retrouve aussi le service du mois : commandes servies, annulées, et temps moyen pour servir.",
          "Pratique pour un entretien individuel, une prime ou un avertissement : tout est daté et justifié.",
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
        href: "/products",
        content: [
          "Définis ton menu : nom, prix de vente, prix de revient (coût), catégorie, unité et seuil d'alerte de stock bas.",
          "Le prix de revient sert à calculer la marge brute dans Rapports & Finances.",
          "Un produit désactivé disparaît du Point de vente et de la commande client, mais reste dans l'historique.",
        ],
      },
      {
        icon: Boxes,
        title: "Stock",
        href: "/stock",
        content: [
          "Vue d'ensemble des quantités, avec mise en évidence des produits sous leur seuil d'alerte.",
          "Le stock évolue tout seul : une vente le diminue, une réception fournisseur l'augmente, une annulation le restaure.",
          "Chaque mouvement est tracé (type, quantité, raison, commande d'origine).",
        ],
      },
      {
        icon: Truck,
        title: "Fournisseurs",
        href: "/suppliers",
        content: [
          "Enregistre tes fournisseurs habituels une fois pour toutes.",
          "Crée une commande fournisseur (articles, quantités, coûts) pour suivre ce qui est attendu et le montant engagé.",
          "⚠️ Marquer une commande « Reçue » ajoute les articles au stock : ne le fais qu'une fois la marchandise arrivée.",
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
        href: "/customers",
        content: [
          "Crée une fiche client (nom, téléphone) pour suivre son historique et ses points.",
          "1 point par tranche de 500 FCFA dépensée lors d'une vente reliée au client (quel que soit le moyen de paiement, LigdiCash compris). Tu peux aussi ajouter ou utiliser des points à la main.",
          "Palier automatique selon le total dépensé : Bronze, Argent à partir de 100 000 FCFA, Or à partir de 500 000 FCFA.",
        ],
      },
      {
        icon: CalendarClock,
        title: "Réservations",
        href: "/reservations",
        content: [
          "Enregistre nom, nombre de personnes, date et heure, et éventuellement une table.",
          "Le jour J : en attente → confirmée → installée → terminée.",
          "Une fois le client installé, la vente se prend au Point de vente en choisissant la même table.",
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
        href: "/expenses",
        content: [
          "Enregistre toutes les charges (loyer, salaires, électricité, transport…) par catégorie et par date. Les catégories se règlent dans Paramètres.",
          "→ Elles sont soustraites de la marge brute dans Rapports & Finances pour donner le résultat net réel.",
        ],
      },
      {
        icon: BarChart3,
        title: "Rapports & Finances",
        href: "/reports",
        content: [
          "Le mois en cours : chiffre d'affaires, marge brute, dépenses et résultat net.",
          "Le graphique et le classement des produits portent sur les 30 derniers jours de ventes encaissées (une commande seulement « servie » n'est pas encore comptée), quel que soit le moyen de paiement.",
        ],
      },
    ],
  },
  {
    title: "Administration",
    sections: [
      {
        icon: Users,
        title: "Utilisateurs",
        href: "/users",
        content: [
          "Crée les comptes de l'équipe : email, mot de passe, rôle et points de vente accessibles.",
          "Désactive un compte plutôt que de le supprimer : son historique (ventes, notes) reste intact.",
          "La page Serveuses permet aussi d'ajouter une serveuse directement dans la bonne équipe.",
        ],
      },
      {
        icon: Landmark,
        title: "Maquis (points de vente)",
        href: "/venues",
        content: [
          "Gère tes points de vente (nom, adresse, téléphone).",
          "Le sélecteur en haut de l'app filtre presque tous les écrans par point de vente. Les règles de notation et les horaires des serveuses sont propres à chaque point de vente.",
        ],
      },
      {
        icon: Building2,
        title: "Entreprises",
        href: "/companies",
        content: [
          "Réservé au propriétaire : informations générales de l'entreprise qui chapeaute tous les points de vente.",
        ],
      },
      {
        icon: ScrollText,
        title: "Journal d'audit",
        href: "/audit-log",
        content: [
          "Trace qui a fait quoi et quand : commandes, dépenses, comptes, corrections d'heures, fiches de comportement, changements de règles de notation, factures LigdiCash…",
          "Utile pour retrouver l'origine d'un changement inattendu sans interroger toute l'équipe.",
        ],
      },
      {
        icon: Settings,
        title: "Paramètres",
        href: "/settings",
        content: [
          "Ton profil (nom, téléphone, mot de passe).",
          "Le point de vente actif (nom, adresse, téléphone), les catégories de dépenses et un raccourci vers la notation des serveuses.",
          "Paiement LigdiCash (propriétaire) : clés du compte marchand, mode test ou réel, bouton « Retirer ». Les clés ne sont jamais réaffichées en entier.",
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
        href: "/assistant",
        content: [
          "Répond à des questions sur tes vraies données : chiffre d'affaires, produits les plus vendus, stock bas, dépenses, meilleurs clients, résultat net, état de la caisse.",
          "Il ne modifie jamais rien : c'est un outil de lecture et d'analyse.",
        ],
      },
    ],
  },
];

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function GuidePage() {
  const [openKey, setOpenKey] = useState<string | null>("Bien démarrer-0");
  const [query, setQuery] = useState("");
  const user = useAppStore((s) => s.user);

  // Recherche dans les titres et le texte ; les sections trouvées s'affichent ouvertes.
  const groups = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      sections: g.sections.filter((s) => normalize([s.title, ...s.content].join(" ")).includes(q)),
    })).filter((g) => g.sections.length > 0);
  }, [query]);
  const searching = query.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Guide d&apos;utilisation</h1>
          <p className="text-sm text-muted-foreground">
            {user?.firstName ? `Salut ${user.firstName} ! ` : ""}Tous les écrans de l&apos;application, en détail, avec
            leurs liens entre eux.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher : LigdiCash, avoir, retard, caisse…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher dans le guide"
        />
      </div>

      {searching && groups.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Rien trouvé pour « {query} ».
        </p>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.title} className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> {group.title}
            </div>
            {group.sections.map((s) => {
              const Icon = s.icon;
              const key = `${group.title}-${GROUPS.find((g) => g.title === group.title)!.sections.indexOf(s)}`;
              const open = searching || openKey === key;
              return (
                <Card key={key}>
                  <button
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    onClick={() => setOpenKey(openKey === key ? null : key)}
                    aria-expanded={open}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="font-medium">{s.title}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>
                  {open && (
                    <CardContent className="pt-0">
                      <ul className="ml-12 list-disc space-y-2 text-sm text-muted-foreground">
                        {s.content.map((line, j) => (
                          <li key={j}>{line}</li>
                        ))}
                      </ul>
                      {s.href && (
                        <Link
                          href={s.href}
                          className="ml-12 mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline"
                        >
                          Ouvrir l&apos;écran <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
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
