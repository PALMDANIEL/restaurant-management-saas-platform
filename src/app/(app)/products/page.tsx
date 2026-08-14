"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVenueParam } from "@/hooks/use-venue-query";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Package, Tag, X } from "lucide-react";

type Category = { id: number; name: string; color: string; venueId: number };
type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  costPrice: number;
  unit: string;
  stockQuantity: string;
  stockAlertThreshold: string;
  categoryId: number | null;
  venueId: number;
  active: boolean;
};

export default function ProductsPage() {
  const venueParam = useVenueParam();
  const venues = useAppStore((s) => s.venues);
  const queryClient = useQueryClient();
  const [showProductForm, setShowProductForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const targetVenueId =
    venueParam !== "all" ? Number(venueParam) : venues[0]?.id;

  const { data: categoriesData } = useQuery({
    queryKey: ["categories", venueParam],
    queryFn: async () => (await fetch(`/api/categories?venueId=${venueParam}`)).json(),
  });
  const { data: productsData, isLoading } = useQuery({
    queryKey: ["products", venueParam],
    queryFn: async () => (await fetch(`/api/products?venueId=${venueParam}`)).json(),
  });

  const categories: Category[] = categoriesData?.categories ?? [];
  const products: Product[] = productsData?.products ?? [];

  const createCategory = useMutation({
    mutationFn: async (payload: { name: string; color: string }) => {
      if (!targetVenueId) {
        throw new Error("Créez d'abord un établissement avant d'ajouter une catégorie.");
      }
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, venueId: targetVenueId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success("Catégorie créée");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setShowCategoryForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Catégorie supprimée");
    },
  });

  const saveProduct = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const isEdit = !!editingProduct;
      const res = await fetch("/api/products", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { ...payload, id: editingProduct!.id } : payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      toast.success(editingProduct ? "Produit modifié" : "Produit créé");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowProductForm(false);
      setEditingProduct(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/products?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produit désactivé");
    },
  });

  function handleProductSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetVenueId) {
      toast.error("Créez d'abord un établissement avant d'ajouter un produit.");
      return;
    }
    const form = new FormData(e.currentTarget);
    saveProduct.mutate({
      venueId: targetVenueId,
      categoryId: form.get("categoryId") ? Number(form.get("categoryId")) : null,
      name: String(form.get("name")),
      description: String(form.get("description") || ""),
      price: Number(form.get("price")),
      costPrice: Number(form.get("costPrice") || 0),
      unit: String(form.get("unit") || "unité"),
      stockQuantity: Number(form.get("stockQuantity") || 0),
      stockAlertThreshold: Number(form.get("stockAlertThreshold") || 5),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produits & Catégories</h1>
          <p className="text-sm text-muted-foreground">
            Gérez votre carte, vos prix et vos catégories.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCategoryForm(true)} disabled={!targetVenueId}>
            <Tag className="h-4 w-4" /> Nouvelle catégorie
          </Button>
          <Button
            disabled={!targetVenueId}
            onClick={() => {
              setEditingProduct(null);
              setShowProductForm(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nouveau produit
          </Button>
        </div>
      </div>

      {!targetVenueId && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
          Aucun établissement (maquis/restaurant) n&apos;a encore été créé pour cette entreprise.
          Créez-en un d&apos;abord dans l&apos;écran Établissements avant d&apos;ajouter des catégories ou des produits.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Badge key={c.id} className="border-border" style={{ borderColor: c.color, color: c.color }}>
            {c.name}
            <button onClick={() => deleteCategory.mutate(c.id)} className="ml-1">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune catégorie pour ce maquis.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.filter((p) => p.active).map((p) => {
          const cat = categories.find((c) => c.id === p.categoryId);
          const low = Number(p.stockQuantity) <= Number(p.stockAlertThreshold);
          return (
            <Card key={p.id} className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Package className="h-5 w-5" />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingProduct(p);
                        setShowProductForm(true);
                      }}
                      className="rounded-lg p-1.5 hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteProduct.mutate(p.id)}
                      className="rounded-lg p-1.5 hover:bg-muted text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-3 font-semibold">{p.name}</p>
                {cat && (
                  <p className="text-xs" style={{ color: cat.color }}>
                    {cat.name}
                  </p>
                )}
                <p className="mt-2 text-lg font-bold text-primary">{formatMoney(p.price)}</p>
                <p className="text-xs text-muted-foreground">Coût: {formatMoney(p.costPrice)}</p>
                <div
                  className={cn(
                    "mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                    low ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                  )}
                >
                  Stock: {p.stockQuantity} {p.unit}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!isLoading && products.filter((p) => p.active).length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun produit. Créez votre premier produit.</p>
      )}

      {showCategoryForm && (
        <Modal onClose={() => setShowCategoryForm(false)} title="Nouvelle catégorie">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              createCategory.mutate({
                name: String(form.get("name")),
                color: String(form.get("color") || "#ea580c"),
              });
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nom</Label>
              <Input name="name" required placeholder="Ex: Boissons" />
            </div>
            <div>
              <Label>Couleur</Label>
              <Input name="color" type="color" defaultValue="#ea580c" className="h-10 p-1" />
            </div>
            <Button type="submit" className="w-full" loading={createCategory.isPending}>
              Créer
            </Button>
          </form>
        </Modal>
      )}

      {showProductForm && (
        <Modal
          onClose={() => {
            setShowProductForm(false);
            setEditingProduct(null);
          }}
          title={editingProduct ? "Modifier le produit" : "Nouveau produit"}
        >
          <form onSubmit={handleProductSubmit} className="space-y-3">
            <div>
              <Label>Nom</Label>
              <Input name="name" required defaultValue={editingProduct?.name} />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select name="categoryId" defaultValue={editingProduct?.categoryId ?? ""}>
                <option value="">Aucune</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prix de vente (FCFA)</Label>
                <Input name="price" type="number" required defaultValue={editingProduct?.price} />
              </div>
              <div>
                <Label>Prix de revient (FCFA)</Label>
                <Input name="costPrice" type="number" defaultValue={editingProduct?.costPrice} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Stock initial</Label>
                <Input
                  name="stockQuantity"
                  type="number"
                  defaultValue={editingProduct?.stockQuantity}
                  disabled={!!editingProduct}
                />
              </div>
              <div>
                <Label>Seuil d&apos;alerte</Label>
                <Input
                  name="stockAlertThreshold"
                  type="number"
                  defaultValue={editingProduct?.stockAlertThreshold ?? 5}
                />
              </div>
            </div>
            <div>
              <Label>Unité</Label>
              <Input name="unit" defaultValue={editingProduct?.unit ?? "unité"} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea name="description" defaultValue={editingProduct?.description ?? ""} />
            </div>
            <Button type="submit" className="w-full" loading={saveProduct.isPending}>
              {editingProduct ? "Enregistrer" : "Créer le produit"}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
