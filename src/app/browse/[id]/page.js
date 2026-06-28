"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Card, Skeleton } from "@heroui/react";
import { authClient } from "@/lib/auth-client";

export default function ArtworkDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  
  // 🌟 SECURITY & SESSION INITIALIZATION
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  
  const [artwork, setArtwork] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const viewerEmail = session?.user?.email;

  // Sync artwork details from cluster
  useEffect(() => {
    if (id) {
      setLoading(true);
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      
      fetch(`${apiBaseUrl}/api/artworks/${id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.artwork) {
            setArtwork(data.artwork);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error pulling masterpiece details:", err);
          setLoading(false);
        });
    }
  }, [id]);

  // 🌟 ACTION: STRIPE ARTWORK CHECKOUT ROUTER
  const handleBuyNow = async () => {
    if (!session) {
      alert("Please sign in to your account to purchase artworks.");
      router.push("/login");
      return;
    }

    setPurchasing(true);
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      
      const response = await fetch(`${apiBaseUrl}/api/payment/create-artwork-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerEmail: viewerEmail,
          buyerName: session.user.name || "Collector",
          artworkId: id,
        }),
      });

      const data = await response.json();
      
      if (data.success && data.url) {
        // Save purchase context so the dashboard can call confirm-purchase after redirect
        // This is the local dev fallback since Stripe webhooks can't reach localhost
        sessionStorage.setItem("pending_artwork_purchase", JSON.stringify({
          artworkId: id,
          buyerName: session.user.name || "Collector",
        }));
        window.location.href = data.url;
      } else {
        alert(data.message || "Could not spin up payment portal instance.");
      }
    } catch (err) {
      console.error("Checkout transaction error:", err);
      alert("Payment processing network error.");
    } finally {
      setPurchasing(false);
    }
  };

  // 🌟 ACTION: ARTIST INLINE DELETE CONTROLLER
  const handleDeleteArtwork = async () => {
    if (!confirm("Are you absolute certain you want to remove this composition?")) return;
    
    setDeleting(true);
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const response = await fetch(`${apiBaseUrl}/api/artworks/${id}`, { method: "DELETE" });
      const data = await response.json();
      
      if (data.success) {
        alert("Masterpiece removed successfully from marketplace archives.");
        router.push("/browse");
      }
    } catch (err) {
      console.error("Error purging composition record:", err);
    } finally {
      setDeleting(false);
    }
  };

  // 🧱 SKELETON LOADING FRAMEWORK STATE
  if (loading || sessionLoading) {
    return (
      <div className="min-h-screen bg-black text-white p-8 md:p-16 flex flex-col md:flex-row gap-12 font-sans animate-pulse">
        <div className="w-full md:w-1/2 aspect-square bg-zinc-900 rounded-3xl" />
        <div className="w-full md:w-1/2 space-y-6 py-4">
          <div className="h-8 w-2/3 bg-zinc-900 rounded-xl" />
          <div className="h-4 w-1/3 bg-zinc-900 rounded-xl" />
          <div className="h-24 w-full bg-zinc-900 rounded-2xl" />
          <div className="h-12 w-1/2 bg-zinc-900 rounded-xl" />
        </div>
      </div>
    );
  }

  // ❌ RECORD NOT FOUND FALLBACK LAYER
  if (!artwork) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center space-y-4 font-sans">
        <h2 className="text-xl font-bold text-zinc-400">Masterpiece Missing From Catalog</h2>
        <p className="text-zinc-600 text-sm">The item layout requested could not be resolved from cluster collections.</p>
        <Button size="sm" className="bg-zinc-900 text-white border border-zinc-800" onClick={() => router.push("/browse")}>
          Return to Marketplace
        </Button>
      </div>
    );
  }

  // 🌟 RELATIONAL COMPARISON VALIDATION ATTRIBUTES
  const isOwner = viewerEmail && artwork.artistEmail === viewerEmail;

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-12 items-start">
        
        {/* LEFT CANVAS: VISUAL ASSET LAYOUT */}
        <div className="w-full md:w-1/2 rounded-3xl overflow-hidden border border-zinc-900 bg-zinc-950/40">
          <img 
            src={artwork.image || "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800"} 
            alt={artwork.title} 
            className="w-full h-auto object-cover aspect-square"
          />
        </div>

        {/* RIGHT CANVAS: METRICS & ACTION HANDLERS */}
        <div className="w-full md:w-1/2 space-y-6">
          <div className="space-y-1.5">
            <span className="px-2.5 py-0.5 text-xs font-bold bg-orange-500/10 text-orange-400 rounded-md uppercase tracking-wider">
              {artwork.category || "Unclassified"}
            </span>
            <h1 className="text-4xl font-black tracking-tight">{artwork.title}</h1>
            <p className="text-sm text-zinc-500">
              Composed by: <span className="text-zinc-300 font-semibold">{artwork.artistName || "Exhibited Creator"}</span>
              {isOwner && <span className="ml-2 text-xs text-orange-500 font-mono">(Your Workspace Production)</span>}
            </p>
          </div>

          <div className="h-[1px] w-full bg-zinc-900" />

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Creator Narrative Commentary</h3>
            <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">
              {artwork.description || "No description statement was supplied for this specific masterwork configuration."}
            </p>
          </div>

          <Card className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl flex flex-row items-center justify-between">
            <div>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Acquisition Value</p>
              <p className="text-3xl font-black text-orange-400 mt-1">${artwork.price}</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Status State</p>
              <span className="inline-block mt-2 px-2.5 py-0.5 text-xs font-extrabold text-emerald-400 bg-emerald-500/10 rounded-full uppercase tracking-wider">
                Available
              </span>
            </div>
          </Card>

          {/* 🌟 ACTION ROUTING BUTTON MATRIX */}
          <div className="space-y-3">
            {isOwner ? (
              /* 🌟 CASE A: USER OWNS THE ARTWORK -> RENDER MANAGEMENT SYSTEM CONTROLS */
              <div className="flex gap-4">
                <Button 
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 font-bold text-zinc-300 border border-zinc-800 py-6 rounded-xl transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/artist`)}
                >
                  Edit Studio Asset
                </Button>
                <Button 
                  className="flex-1 bg-red-950/40 hover:bg-red-950 text-red-400 border border-red-900/30 font-bold py-6 rounded-xl transition-colors cursor-pointer"
                  onClick={handleDeleteArtwork}
                  disabled={deleting}
                >
                  {deleting ? "Purging File..." : "Delete Masterpiece"}
                </Button>
              </div>
            ) : (
              /* 🌟 CASE B: VISUAL STRIPE ROUTE TRIGGER -> DISABLE IF VIEWER IS THE OWNER */
              <Button
                onClick={handleBuyNow}
                disabled={purchasing}
                className="w-full bg-orange-500 hover:bg-orange-600 py-6 font-bold text-white text-base rounded-xl transition-all shadow-lg cursor-pointer disabled:opacity-50"
              >
                {purchasing ? "Spanning secure network link..." : "Proceed to Stripe Checkout"}
              </Button>
            )}
            
            <p className="text-center text-[11px] text-zinc-600 font-medium">
              Published on catalog infrastructure: {artwork.createdAt ? new Date(artwork.createdAt).toLocaleDateString() : "N/A"}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}