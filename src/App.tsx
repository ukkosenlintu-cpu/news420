import { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  Menu, 
  X, 
  Bookmark, 
  Share2, 
  ExternalLink, 
  Sparkles, 
  LayoutGrid, 
  List, 
  LogOut, 
  LogIn,
  ChevronRight,
  RefreshCw,
  Plus,
  Trash2,
  Clock,
  Newspaper,
  CloudSun,
  MapPin
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { cn } from "./lib/utils";
import { Article, FeedSource, Bookmark as BookmarkType } from "./types";
import { formatDistanceToNow } from "date-fns";
import { GoogleGenAI } from "@google/genai";
import Markdown from "react-markdown";

const DEFAULT_FEEDS: Omit<FeedSource, "id" | "addedBy" | "createdAt">[] = [
  { url: "https://www.theverge.com/rss/index.xml", title: "The Verge", category: "Tech" },
  { url: "https://techcrunch.com/feed/", title: "TechCrunch", category: "Tech" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", title: "NYT Top Stories", category: "News" },
  { url: "https://feeds.bbci.co.uk/news/rss.xml", title: "BBC News", category: "News" },
  { url: "https://www.wired.com/feed/rss", title: "Wired", category: "Tech" },
  { url: "https://hnrss.org/frontpage", title: "Hacker News", category: "Tech" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", title: "Al Jazeera", category: "News" },
  { url: "https://www.theguardian.com/world/rss", title: "The Guardian", category: "News" },
  { url: "https://www.ft.com/?format=rss", title: "Financial Times", category: "Business" },
  { url: "https://www.forbes.com/business/feed/", title: "Forbes", category: "Business" },
  { url: "https://www.nasa.gov/news-release/feed/", title: "NASA News", category: "Science" },
  { url: "https://phys.org/rss-feed/", title: "Phys.org", category: "Science" },
  { url: "https://www.nih.gov/news-events/news-releases/rss.xml", title: "NIH News", category: "Health" },
  { url: "https://www.sciencedaily.com/rss/health_medicine.xml", title: "ScienceDaily Health", category: "Health" },
  { url: "https://www.rollingstone.com/feed/", title: "Rolling Stone", category: "Entertainment" },
  { url: "https://variety.com/feed/", title: "Variety", category: "Entertainment" },
  { url: "https://sports.yahoo.com/rss/", title: "Yahoo Sports", category: "Sports" },
  { url: "https://feeds.bbci.co.uk/sport/rss.xml", title: "BBC Sport", category: "Sports" },
];

const CATEGORIES = ["Daily Briefing", "All", "Tech", "News", "Business", "Science", "Health", "Entertainment", "Sports", "Bookmarks", "Nearby", "AI Tools"];

const EMOTIONS = [
  { name: "Optimistic", icon: "🌟", color: "bg-amber-50 text-amber-600 border-amber-200", desc: "Focus on progress and solutions" },
  { name: "Curious", icon: "🧐", color: "bg-blue-50 text-blue-600 border-blue-200", desc: "Focus on depth and discovery" },
  { name: "Calm", icon: "🧘", color: "bg-emerald-50 text-emerald-600 border-emerald-200", desc: "Focus on objective facts and peace" },
  { name: "Excited", icon: "⚡", color: "bg-purple-50 text-purple-600 border-purple-200", desc: "Focus on breakthroughs and impact" },
  { name: "Concerned", icon: "🛡️", color: "bg-rose-50 text-rose-600 border-rose-200", desc: "Focus on risks and critical analysis" }
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [customFeeds, setCustomFeeds] = useState<FeedSource[]>([]);
  const [selectedFeed, setSelectedFeed] = useState<FeedSource | null>(null);
  const [isAddFeedOpen, setIsAddFeedOpen] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedTitle, setNewFeedTitle] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState("News");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [weather, setWeather] = useState<{ temp: number; desc: string; city: string } | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [userEmotion, setUserEmotion] = useState<string | null>(null);
  const [isEmotionModalOpen, setIsEmotionModalOpen] = useState(true);
  const [isEmotionalizing, setIsEmotionalizing] = useState<Record<string, boolean>>({});
  const [emotionalizedContent, setEmotionalizedContent] = useState<Record<string, { title: string; snippet: string }>>({});
  const [nearbyHappenings, setNearbyHappenings] = useState<any[]>([]);
  const [isFetchingNearby, setIsFetchingNearby] = useState(false);
  const [isSummarizingFeed, setIsSummarizingFeed] = useState(false);
  const [feedSummary, setFeedSummary] = useState<string | null>(null);
  const [dailyBriefing, setDailyBriefing] = useState<string | null>(null);
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  
  // AI Tool States
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [videoStatus, setVideoStatus] = useState("");

  // Firestore Error Handler
  const handleFirestoreError = (error: unknown, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    // We don't necessarily want to crash the whole app, but we should log it
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setDoc(doc(db, "users", u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    });
    return () => unsubscribe();
  }, []);

  // Custom Feeds Listener
  useEffect(() => {
    if (!user) {
      setCustomFeeds([]);
      return;
    }

    const q = query(collection(db, "feeds"), where("addedBy", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feeds: FeedSource[] = [];
      snapshot.forEach((doc) => {
        feeds.push({ id: doc.id, ...doc.data() } as FeedSource);
      });
      setCustomFeeds(feeds);
    }, (error) => {
      handleFirestoreError(error, "list", "feeds");
    });

    return () => unsubscribe();
  }, [user]);

  // Bookmarks Listener
  useEffect(() => {
    if (!user) {
      setBookmarks([]);
      return;
    }
    const q = query(collection(db, "users", user.uid, "bookmarks"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookmarks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BookmarkType)));
    }, (error) => {
      handleFirestoreError(error, "list", `users/${user.uid}/bookmarks`);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Weather
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        // In a real app, use a weather API with these coordinates
        setWeather({ temp: 22, desc: "Partly Cloudy", city: "Current Location" });
      });
    }
  }, []);

  // Check for API Key
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        // Fallback for local dev or when GEMINI_API_KEY is present
        setHasApiKey(!!process.env.GEMINI_API_KEY || !!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    } else {
      alert("API key selection is only available in the AI Studio preview environment.");
    }
  };

  // Fetch Articles
  const fetchArticles = async () => {
    if (activeCategory === "AI Tools" || activeCategory === "Bookmarks" || activeCategory === "Nearby" || activeCategory === "Daily Briefing") return;
    
    setIsLoading(true);
    try {
      let feedsToFetch: Omit<FeedSource, "id" | "addedBy" | "createdAt">[] = [];
      
      if (selectedFeed) {
        feedsToFetch = [selectedFeed];
      } else {
        const allFeeds = [...DEFAULT_FEEDS, ...customFeeds];
        feedsToFetch = activeCategory === "All" 
            ? allFeeds 
            : allFeeds.filter(f => f.category === activeCategory);
      }

      const allArticles: Article[] = [];
      
      for (const feed of feedsToFetch) {
        try {
          const res = await fetch(`/api/rss?url=${encodeURIComponent(feed.url)}`);
          if (!res.ok) throw new Error(`Status code ${res.status}`);
          const data = await res.json();
          if (data.items) {
            const items = data.items.map((item: any) => {
              let imageUrl = item.enclosure?.url;
              if (!imageUrl && item['media:content']) {
                // Handle both single object and array for media:content
                const media = Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content'];
                imageUrl = media.$?.url || media.url;
              }
              return {
                ...item,
                source: feed.title,
                category: feed.category,
                imageUrl: imageUrl,
              };
            });
            allArticles.push(...items);
          }
        } catch (e) {
          console.error(`Failed to fetch ${feed.title}:`, e);
        }
      }

      allArticles.sort((a, b) => {
        const dateA = new Date(a.isoDate || a.pubDate || 0).getTime();
        const dateB = new Date(b.isoDate || b.pubDate || 0).getTime();
        return dateB - dateA;
      });

      setArticles(allArticles);

      // Background fetch for top 3 missing images
      const missingImages = allArticles.filter(a => !a.imageUrl).slice(0, 3);
      missingImages.forEach(async (article) => {
        const url = await findImageForArticle(article);
        if (url) {
          setArticles(prev => prev.map(a => a.link === article.link ? { ...a, imageUrl: url } : a));
        }
      });
    } catch (error) {
      console.error("Error fetching articles:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [activeCategory, customFeeds, selectedFeed]);

  const filteredArticles = useMemo(() => {
    const source = activeCategory === "Bookmarks" 
      ? bookmarks.map(b => ({
          title: b.title,
          link: b.link,
          pubDate: b.pubDate,
          source: b.source,
          contentSnippet: b.contentSnippet
        } as Article))
      : articles;

    if (!searchQuery) return source;
    return source.filter(a => 
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.contentSnippet?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [articles, bookmarks, activeCategory, searchQuery]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handlePreviewFeed = async () => {
    if (!newFeedUrl) return;
    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewItems([]);
    try {
      const res = await fetch(`/api/rss?url=${encodeURIComponent(newFeedUrl)}`);
      if (!res.ok) throw new Error(`Status code ${res.status}`);
      const data = await res.json();
      if (data.items) {
        setPreviewItems(data.items.slice(0, 3));
        if (!newFeedTitle && data.title) {
          setNewFeedTitle(data.title);
        }
      } else {
        throw new Error("No items found in feed");
      }
    } catch (error) {
      console.error("Preview failed:", error);
      setPreviewError("Failed to fetch feed. Please check the URL.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newFeedUrl || !newFeedTitle) return;

    try {
      await addDoc(collection(db, "feeds"), {
        url: newFeedUrl,
        title: newFeedTitle,
        category: newFeedCategory,
        addedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setIsAddFeedOpen(false);
      setNewFeedUrl("");
      setNewFeedTitle("");
    } catch (error) {
      console.error("Error adding feed:", error);
    }
  };

  const removeFeed = async (feedId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "feeds", feedId));
    } catch (error) {
      console.error("Error removing feed:", error);
    }
  };

  const toggleBookmark = async (article: Article) => {
    if (!user) {
      alert("Please login to bookmark articles");
      return;
    }

    const existing = bookmarks.find(b => b.link === article.link);
    if (existing) {
      await deleteDoc(doc(db, "users", user.uid, "bookmarks", existing.id));
    } else {
      await addDoc(collection(db, "users", user.uid, "bookmarks"), {
        uid: user.uid,
        title: article.title,
        link: article.link,
        pubDate: article.pubDate || null,
        source: article.source || "Unknown",
        contentSnippet: article.contentSnippet || "",
        createdAt: serverTimestamp(),
      });
    }
  };

  const summarizeArticle = async (article: Article) => {
    setIsSummarizing(true);
    setSummary(null);
    try {
      // Use process.env.API_KEY if available (from dialog), otherwise fallback to GEMINI_API_KEY
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      // Get user location for maps grounding if available
      let location = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {
        console.log("Location not available for grounding");
      }

      const tools: any[] = [{ googleSearch: {} }];
      if (location) {
        tools.push({ googleMaps: {} });
      }

      const emotionContext = userEmotion ? `The user is currently feeling ${userEmotion}. Please tailor the summary to resonate with this mood. ` : "";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${emotionContext}Summarize this news article in 3-5 bullet points. Focus on the key facts and implications. 
        Use search grounding to find any recent updates or related context if necessary.
        If there are relevant locations, use the maps tool to provide context.
        
        Title: ${article.title}
        Source: ${article.source}
        Content: ${article.contentSnippet || article.content || "No content available"}
        Link: ${article.link}`,
        config: {
          tools,
          toolConfig: location ? {
            retrievalConfig: {
              latLng: location
            }
          } : undefined
        }
      });

      let finalSummary = response.text || "Could not generate summary.";
      
      // Extract maps links if available
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const mapsLinks = chunks
          .filter((c: any) => c.maps)
          .map((c: any) => c.maps.uri);
        
        if (mapsLinks.length > 0) {
          finalSummary += "\n\n**Relevant Locations:**\n" + mapsLinks.map((link: string) => `- [View on Maps](${link})`).join("\n");
        }
      }

      setSummary(finalSummary);
    } catch (error) {
      console.error("Summarization failed:", error);
      setSummary("Failed to generate summary. Please try again.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // AI Tool Functions
  const generateImage = async () => {
    if (!imagePrompt) return;
    
    if (!hasApiKey) {
      handleSelectKey();
      return;
    }

    setIsGeneratingImage(true);
    setGeneratedImage(null);
    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [{ text: imagePrompt }],
        },
        config: {
          imageConfig: { aspectRatio: "16:9", imageSize: "1K" }
        },
      });
      
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`);
            break;
          }
        }
      }
    } catch (error: any) {
      console.error("Image generation failed:", error);
      if (error.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        alert("API Key error. Please select your key again.");
      } else {
        alert("Failed to generate image. Please check your prompt and API key.");
      }
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const findImageForArticle = async (article: Article): Promise<string | null> => {
    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      const findResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find the main image URL for this article: ${article.link}. 
        Look for Open Graph tags (og:image) or the most prominent image on the page.
        Return only the URL as plain text. If you cannot find a valid image URL, return "NOT_FOUND".`,
        config: {
          tools: [{ urlContext: {} }]
        }
      });
      
      const foundUrl = findResponse.text?.trim();
      if (foundUrl && foundUrl.startsWith("http") && !foundUrl.toLowerCase().includes("not_found")) {
        return foundUrl;
      }
    } catch (e) {
      console.error("Failed to find real image URL:", e);
    }
    return null;
  };

  const generateImageForArticle = async (article: Article, editPrompt?: string) => {
    if (!hasApiKey) {
      handleSelectKey();
      return;
    }

    setArticles(prev => prev.map(a => a.link === article.link ? { ...a, isGeneratingImage: true } : a));
    if (selectedArticle?.link === article.link) {
      setSelectedArticle(prev => prev ? { ...prev, isGeneratingImage: true } : null);
    }

    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      // 1. Try to find the real image URL first if not editing
      if (!editPrompt) {
        const foundUrl = await findImageForArticle(article);
        if (foundUrl) {
          setArticles(prev => prev.map(a => a.link === article.link ? { ...a, imageUrl: foundUrl, isGeneratingImage: false } : a));
          if (selectedArticle?.link === article.link) {
            setSelectedArticle(prev => prev ? { ...prev, imageUrl: foundUrl, isGeneratingImage: false } : null);
          }
          return;
        }
      }

      // 2. Proceed to generate if not found or if editing
      const contents: any = {
        parts: []
      };

      if (editPrompt && article.imageUrl) {
        // Image editing mode
        contents.parts.push({
          inlineData: {
            data: article.imageUrl.split(',')[1],
            mimeType: "image/png"
          }
        });
        contents.parts.push({ text: `Edit this image based on this request: ${editPrompt}. Maintain the same style and subject but apply the changes.` });
      } else {
        // Initial generation
        const prompt = `Generate a high-quality, professional news illustration for the following article title: "${article.title}". 
        The image should be in a modern, clean editorial style suitable for a high-end news application. 
        Avoid text in the image. Focus on symbolic or conceptual representations related to ${article.category || "the news"}.`;
        contents.parts.push({ text: prompt });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents,
        config: {
          imageConfig: { aspectRatio: "16:9", imageSize: "1K" }
        },
      });
      
      let imageUrl = null;
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (imageUrl) {
        setArticles(prev => prev.map(a => a.link === article.link ? { ...a, imageUrl, isGeneratingImage: false } : a));
        if (selectedArticle?.link === article.link) {
          setSelectedArticle(prev => prev ? { ...prev, imageUrl, isGeneratingImage: false } : null);
        }
      }
    } catch (error: any) {
      console.error("Article image generation failed:", error);
      setArticles(prev => prev.map(a => a.link === article.link ? { ...a, isGeneratingImage: false } : a));
      if (selectedArticle?.link === article.link) {
        setSelectedArticle(prev => prev ? { ...prev, isGeneratingImage: false } : null);
      }
      
      if (error.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        alert("API Key error. Please select your key again.");
      }
    }
  };

  const generateVideo = async () => {
    if (!videoPrompt && !selectedFile) return;
    
    if (!hasApiKey) {
      handleSelectKey();
      return;
    }

    setIsVideoGenerating(true);
    setGeneratedVideo(null);
    setVideoStatus("Initializing Veo...");
    
    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      let imagePayload = undefined;
      if (selectedFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
        });
        reader.readAsDataURL(selectedFile);
        const base64Data = await base64Promise;
        imagePayload = {
          imageBytes: base64Data,
          mimeType: selectedFile.type,
        };
      }

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt,
        image: imagePayload,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        setVideoStatus("Processing video (this may take a few minutes)...");
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
        const response = await fetch(downloadLink, {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
        });
        const blob = await response.blob();
        setGeneratedVideo(URL.createObjectURL(blob));
      }
    } catch (error: any) {
      console.error("Video generation failed:", error);
      if (error.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        alert("API Key error. Please select your key again.");
      } else {
        alert("Failed to generate video.");
      }
    } finally {
      setIsVideoGenerating(false);
      setVideoStatus("");
    }
  };

  const emotionalizeArticle = async (article: Article) => {
    if (!userEmotion) return;
    
    setIsEmotionalizing(prev => ({ ...prev, [article.link]: true }));
    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Rewrite the following news article title and snippet to match the user's current emotion: "${userEmotion}". 
        Make it feel more personal and resonant with this mood, while maintaining the core facts.
        
        Original Title: ${article.title}
        Original Snippet: ${article.contentSnippet || "No snippet available"}
        
        Return the result as JSON with 'title' and 'snippet' fields.`,
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || "{}");
      if (result.title && result.snippet) {
        setEmotionalizedContent(prev => ({
          ...prev,
          [article.link]: { title: result.title, snippet: result.snippet }
        }));
      }
    } catch (error) {
      console.error("Emotionalizing failed:", error);
    } finally {
      setIsEmotionalizing(prev => ({ ...prev, [article.link]: false }));
    }
  };

  const generateDailyBriefing = async () => {
    setIsGeneratingBriefing(true);
    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      // Take top 2 articles from each major category
      const majorCategories = ["Tech", "News", "Business", "Science"];
      const allFeeds = [...DEFAULT_FEEDS, ...customFeeds];
      
      let briefingContext = "";
      for (const cat of majorCategories) {
        const catArticles = articles.filter(a => a.category === cat).slice(0, 2);
        if (catArticles.length > 0) {
          briefingContext += `\nCategory: ${cat}\n` + catArticles.map(a => `- ${a.title}`).join("\n");
        }
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Create a comprehensive "Daily Briefing" summary of the most important news across different categories. 
        Focus on the big picture and how these stories connect. 
        Use an authoritative yet accessible tone, like a morning news briefing.
        Structure with a main headline, a "Top Stories" section, and a "Why it Matters" conclusion.
        
        News Context:
        ${briefingContext}`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      setDailyBriefing(response.text || "Failed to generate briefing.");
    } catch (error) {
      console.error("Daily briefing failed:", error);
      setDailyBriefing("An error occurred while generating your briefing.");
    } finally {
      setIsGeneratingBriefing(false);
    }
  };

  useEffect(() => {
    if (activeCategory === "Daily Briefing" && !dailyBriefing && articles.length > 0) {
      generateDailyBriefing();
    }
  }, [activeCategory, articles]);

  const summarizeCurrentFeed = async () => {
    if (filteredArticles.length === 0) return;
    setIsSummarizingFeed(true);
    setFeedSummary(null);
    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      const topArticles = filteredArticles.slice(0, 5);
      const articlesText = topArticles.map((a, i) => `${i+1}. ${a.title}\n${a.contentSnippet || ""}`).join("\n\n");
      
      const emotionContext = userEmotion ? `The user is currently feeling ${userEmotion}. Please tailor the summary to resonate with this mood. ` : "";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${emotionContext}Create a cohesive, high-level summary of the current top news in the "${activeCategory}" category based on these articles. 
        Focus on the main themes, common threads, and overall impact. 
        Use a professional yet engaging editorial tone. 
        Structure the summary with a catchy title and 3-4 well-written paragraphs.
        
        Articles:
        ${articlesText}`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      setFeedSummary(response.text || "Failed to generate summary.");
    } catch (error) {
      console.error("Feed summarization failed:", error);
      setFeedSummary("An error occurred while generating the summary.");
    } finally {
      setIsSummarizingFeed(false);
    }
  };

  const fetchNearbyHappenings = async () => {
    setIsFetchingNearby(true);
    try {
      const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY)!;
      const ai = new GoogleGenAI({ apiKey });
      
      let location = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (e) {
        console.log("Location not available for nearby happenings");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find 5-7 interesting nearby happenings, events, or popular activities happening right now or very soon. 
        Focus on variety: local festivals, concerts, museum exhibitions, or unique community gatherings.
        Include a title, a short description, the location name, and a category for each.
        Return the result as a JSON array of objects with 'title', 'description', 'location', 'category', and 'link' (if available).`,
        config: {
          tools: [{ googleMaps: {} }, { googleSearch: {} }],
          toolConfig: location ? {
            retrievalConfig: {
              latLng: location
            }
          } : undefined,
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || "[]");
      setNearbyHappenings(result);
    } catch (error) {
      console.error("Failed to fetch nearby happenings:", error);
    } finally {
      setIsFetchingNearby(false);
    }
  };

  useEffect(() => {
    if (activeCategory === "Nearby" && nearbyHappenings.length === 0) {
      fetchNearbyHappenings();
    }
  }, [activeCategory]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-[#FFD700] selection:text-black">
      {/* Emotion Selection Modal */}
      <AnimatePresence>
        {isEmotionModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-2xl w-full bg-white rounded-[40px] shadow-2xl border border-gray-100 p-8 md:p-12 text-center space-y-8"
            >
              <div className="space-y-4">
                <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
                  How are you <span className="text-blue-600">feeling</span> today?
                </h1>
                <p className="text-gray-500 text-lg max-w-md mx-auto">
                  We'll tailor your news experience to match your current mood and perspective.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EMOTIONS.map((emotion) => (
                  <button
                    key={emotion.name}
                    onClick={() => {
                      setUserEmotion(emotion.name);
                      setIsEmotionModalOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-4 p-6 rounded-3xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] text-left group",
                      emotion.color
                    )}
                  >
                    <span className="text-4xl group-hover:rotate-12 transition-transform">{emotion.icon}</span>
                    <div>
                      <div className="font-bold text-lg">{emotion.name}</div>
                      <div className="text-sm opacity-70">{emotion.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <button 
                onClick={() => setIsEmotionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors"
              >
                Skip for now, show me everything
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-full lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Newspaper className="text-white" size={18} />
              </div>
              <h1 className="text-xl font-bold tracking-tight hidden sm:block">PulsePoint</h1>
            </div>
          </div>

          <div className="flex-1 max-w-xl flex items-center gap-3">
            {userEmotion && (
              <button 
                onClick={() => setIsEmotionModalOpen(true)}
                className={cn(
                  "hidden md:flex items-center gap-2 px-4 py-2 rounded-full border transition-all hover:scale-105 active:scale-95",
                  EMOTIONS.find(e => e.name === userEmotion)?.color
                )}
              >
                <span className="text-lg">{EMOTIONS.find(e => e.name === userEmotion)?.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider">{userEmotion}</span>
              </button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="Search news, topics, sources..."
                className="w-full bg-gray-100 border-none rounded-full py-2 pl-10 pr-4 focus:ring-2 focus:ring-black transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {weather && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-100">
                <CloudSun size={16} className="text-orange-500" />
                <span className="text-sm font-medium">{weather.temp}°C</span>
              </div>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <img 
                  src={user.photoURL || ""} 
                  alt={user.displayName || ""} 
                  className="w-8 h-8 rounded-full border border-gray-200"
                />
                <button 
                  onClick={handleLogout}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                <LogIn size={16} />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-8">
        {/* Sidebar (Desktop) */}
        <aside className="hidden lg:block w-64 shrink-0 space-y-8">
          <nav className="space-y-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3 mb-4">Categories</p>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setSelectedFeed(null);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all text-sm font-medium",
                  activeCategory === cat && !selectedFeed
                    ? "bg-black text-white shadow-lg shadow-black/10" 
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <div className="flex items-center gap-3">
                  {cat === "All" && <LayoutGrid size={16} />}
                  {cat === "Bookmarks" && <Bookmark size={16} />}
                  {cat === "AI Tools" && <Sparkles size={16} />}
                  {cat !== "All" && cat !== "Bookmarks" && cat !== "AI Tools" && <ChevronRight size={14} className="opacity-50" />}
                  {cat}
                </div>
                {cat === "Bookmarks" && bookmarks.length > 0 && (
                  <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {bookmarks.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl text-white">
            <Sparkles size={24} className="mb-3" />
            <h3 className="font-bold mb-1">AI Insights</h3>
            <p className="text-xs opacity-80 leading-relaxed">
              Select any article to generate an instant AI-powered summary with live search context.
            </p>
          </div>

          {user && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between px-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">My Feeds</p>
                  <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {customFeeds.length}
                  </span>
                </div>
                <button 
                  onClick={() => setIsAddFeedOpen(true)}
                  className="p-1 hover:bg-black hover:text-white rounded-full text-gray-400 transition-all"
                  title="Add New Feed"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {customFeeds.map(feed => (
                  <div 
                    key={feed.id} 
                    onClick={() => {
                      setSelectedFeed(feed);
                      setActiveCategory(feed.category);
                    }}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2.5 rounded-xl transition-all cursor-pointer border border-transparent",
                      selectedFeed?.id === feed.id
                        ? "bg-white border-gray-200 shadow-sm ring-1 ring-black/5"
                        : "hover:bg-white hover:border-gray-100 hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                        selectedFeed?.id === feed.id ? "bg-blue-500 text-white" : "bg-gray-50 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500"
                      )}>
                        <Newspaper size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className={cn(
                          "text-sm font-semibold truncate",
                          selectedFeed?.id === feed.id ? "text-black" : "text-gray-700"
                        )}>{feed.title}</p>
                        <p className="text-[10px] text-gray-400 truncate">{feed.category}</p>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFeed(feed.id!);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {customFeeds.length === 0 && (
                  <div className="px-3 py-6 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-[10px] text-gray-400 italic">No custom feeds yet.</p>
                    <button 
                      onClick={() => setIsAddFeedOpen(true)}
                      className="text-[10px] text-blue-600 font-bold mt-2 hover:underline"
                    >
                      Add your first feed
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {activeCategory === "Daily Briefing" ? (
            <div className="max-w-4xl mx-auto space-y-8">
              <div className="bg-white p-10 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8">
                  <button 
                    onClick={generateDailyBriefing}
                    disabled={isGeneratingBriefing}
                    className={cn("p-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-400 transition-all", isGeneratingBriefing && "animate-spin")}
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>
                <div className="relative z-10 space-y-8">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
                      <Clock size={28} />
                    </div>
                    <div>
                      <h1 className="text-3xl font-black">Daily Briefing</h1>
                      <p className="text-gray-500">Your AI-curated summary of the world's top stories.</p>
                    </div>
                  </div>
                  
                  {isGeneratingBriefing ? (
                    <div className="space-y-6 py-10">
                      <div className="h-8 bg-gray-100 rounded-full w-3/4 animate-pulse" />
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-50 rounded-full w-full animate-pulse" />
                        <div className="h-4 bg-gray-50 rounded-full w-5/6 animate-pulse" />
                        <div className="h-4 bg-gray-50 rounded-full w-4/6 animate-pulse" />
                      </div>
                      <div className="h-8 bg-gray-100 rounded-full w-1/2 animate-pulse" />
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-50 rounded-full w-full animate-pulse" />
                        <div className="h-4 bg-gray-50 rounded-full w-full animate-pulse" />
                        <div className="h-4 bg-gray-50 rounded-full w-3/4 animate-pulse" />
                      </div>
                    </div>
                  ) : dailyBriefing ? (
                    <div className="prose prose-lg max-w-none">
                      <Markdown>{dailyBriefing}</Markdown>
                    </div>
                  ) : (
                    <div className="py-20 text-center space-y-4">
                      <Newspaper size={48} className="mx-auto text-gray-200" />
                      <p className="text-gray-400">Loading your briefing...</p>
                    </div>
                  )}
                </div>
                {/* Decorative background elements */}
                <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-amber-50 rounded-full blur-3xl opacity-50" />
                <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-50" />
              </div>
            </div>
          ) : activeCategory === "AI Tools" ? (
            <div className="space-y-12">
              {!hasApiKey && (
                <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-200 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black">Connect Your Gemini API Key</h3>
                    <p className="text-indigo-100 max-w-md">To use advanced AI features like image and video generation, you need to select a paid Gemini API key.</p>
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-xs font-bold underline opacity-80 hover:opacity-100">Learn about billing</a>
                  </div>
                  <button 
                    onClick={handleSelectKey}
                    className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black hover:bg-indigo-50 transition-all flex items-center gap-2 shrink-0"
                  >
                    <Sparkles size={20} />
                    Select API Key
                  </button>
                </div>
              )}

              <section className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Image Generation</h2>
                    <p className="text-sm text-gray-500">Create visuals for your news stories using Gemini 3.1 Flash Image.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <textarea 
                    placeholder="Describe the image you want to create..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 focus:ring-2 focus:ring-indigo-500 transition-all min-h-[100px]"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                  />
                  <button 
                    onClick={generateImage}
                    disabled={isGeneratingImage || !imagePrompt}
                    className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGeneratingImage ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
                    {isGeneratingImage ? "Generating..." : "Generate Image"}
                  </button>
                  {generatedImage && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-6">
                      <img src={generatedImage} alt="Generated" className="w-full rounded-2xl shadow-lg border border-gray-200" />
                    </motion.div>
                  )}
                </div>
              </section>

              <section className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                    <Share2 size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Video Generation (Veo)</h2>
                    <p className="text-sm text-gray-500">Animate images or create videos from prompts.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">Text Prompt</label>
                      <textarea 
                        placeholder="Describe the video..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 focus:ring-2 focus:ring-purple-500 transition-all min-h-[100px]"
                        value={videoPrompt}
                        onChange={(e) => setVideoPrompt(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">Input Image (Optional)</label>
                      <div className="h-[100px] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center relative hover:border-purple-300 transition-colors">
                        <input 
                          type="file" 
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          accept="image/*"
                        />
                        {selectedFile ? (
                          <span className="text-sm font-medium text-purple-600">{selectedFile.name}</span>
                        ) : (
                          <>
                            <Plus size={20} className="text-gray-400 mb-1" />
                            <span className="text-xs text-gray-400">Upload Image</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={generateVideo}
                    disabled={isVideoGenerating || (!videoPrompt && !selectedFile)}
                    className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isVideoGenerating ? <RefreshCw size={20} className="animate-spin" /> : <Share2 size={20} />}
                    {isVideoGenerating ? "Processing..." : "Generate Video"}
                  </button>
                  {videoStatus && <p className="text-center text-sm text-purple-600 font-medium animate-pulse">{videoStatus}</p>}
                  {generatedVideo && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-6">
                      <video src={generatedVideo} controls className="w-full rounded-2xl shadow-lg border border-gray-200" />
                    </motion.div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col">
                  <h2 className="text-2xl font-bold">
                    {selectedFeed ? selectedFeed.title : `${activeCategory} Feed`}
                  </h2>
                  {selectedFeed && (
                    <p className="text-xs text-gray-500 mt-1">
                      Showing articles from {selectedFeed.url}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeCategory !== "Nearby" && activeCategory !== "Bookmarks" && activeCategory !== "AI Tools" && (
                    <button 
                      onClick={summarizeCurrentFeed}
                      disabled={isSummarizingFeed || filteredArticles.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-xs hover:bg-indigo-100 transition-all disabled:opacity-50"
                    >
                      {isSummarizingFeed ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      Summarize Feed
                    </button>
                  )}
                  <button 
                    onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
                    className="p-2 hover:bg-gray-200 rounded-lg text-gray-500"
                  >
                    {viewMode === "grid" ? <List size={20} /> : <LayoutGrid size={20} />}
                  </button>
                  <button 
                    onClick={activeCategory === "Nearby" ? fetchNearbyHappenings : fetchArticles}
                    className={cn("p-2 hover:bg-gray-200 rounded-lg text-gray-500", (isLoading || isFetchingNearby) && "animate-spin")}
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>
              </div>

              {feedSummary && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 text-white shadow-xl shadow-indigo-100 relative overflow-hidden group"
                >
                  <div className="absolute top-4 right-4 z-20">
                    <button onClick={() => setFeedSummary(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-2 text-indigo-200 font-bold uppercase tracking-widest text-[10px]">
                      <Sparkles size={14} />
                      <span>AI Feed Summary • {activeCategory}</span>
                    </div>
                    <div className="prose prose-invert max-w-none">
                      <Markdown>{feedSummary}</Markdown>
                    </div>
                  </div>
                  {/* Decorative background elements */}
                  <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-700" />
                </motion.div>
              )}

              {isLoading || isFetchingNearby ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl h-80 animate-pulse border border-gray-100" />
                  ))}
                </div>
              ) : activeCategory === "Nearby" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  <AnimatePresence mode="popLayout">
                    {nearbyHappenings.map((happening, idx) => (
                      <motion.div
                        key={happening.title + idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-gray-300 transition-all p-6 flex flex-col"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                            {happening.category}
                          </span>
                          <MapPin size={16} className="text-gray-400" />
                        </div>
                        <h3 className="font-bold text-lg leading-snug mb-2">{happening.title}</h3>
                        <p className="text-sm text-gray-500 mb-4 flex-1">{happening.description}</p>
                        <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <MapPin size={12} />
                            <span className="line-clamp-1">{happening.location}</span>
                          </div>
                          {happening.link && (
                            <button 
                              onClick={() => window.open(happening.link, "_blank")}
                              className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1"
                            >
                              Details <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {nearbyHappenings.length === 0 && !isFetchingNearby && (
                    <div className="col-span-full py-20 text-center">
                      <MapPin size={48} className="mx-auto text-gray-200 mb-4" />
                      <h3 className="text-xl font-bold text-gray-400">No happenings found nearby</h3>
                      <p className="text-gray-400">Try refreshing or check your location settings.</p>
                    </div>
                  )}
                </div>
              ) : filteredArticles.length > 0 ? (
                <div className={cn(
                  "grid gap-6",
                  viewMode === "grid" ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
                )}>
                  <AnimatePresence mode="popLayout">
                    {filteredArticles.map((article, idx) => (
                      <motion.div
                        key={article.link + idx}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-xl hover:border-gray-300 transition-all cursor-pointer",
                          viewMode === "list" && "flex gap-6"
                        )}
                        onClick={() => {
                          setSelectedArticle(article);
                          setSummary(null);
                        }}
                      >
                        <div className={cn(
                          "bg-gray-100 flex items-center justify-center relative group/img",
                          viewMode === "grid" ? "aspect-video" : "w-48 shrink-0"
                        )}>
                          {article.imageUrl ? (
                            <img 
                              src={article.imageUrl} 
                              alt={article.title} 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <Newspaper size={32} className="text-gray-300" />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  generateImageForArticle(article);
                                }}
                                disabled={article.isGeneratingImage}
                                className="opacity-0 group-hover/img:opacity-100 absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white transition-all"
                              >
                                {article.isGeneratingImage ? (
                                  <RefreshCw size={24} className="animate-spin" />
                                ) : (
                                  <>
                                    <Sparkles size={24} className="mb-1" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Find or Generate Image</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-gray-500 border border-gray-100 shadow-sm">
                            {article.source}
                          </div>
                        </div>
                        <div className="p-5 flex flex-col flex-1">
                          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                            <Clock size={12} />
                            <span>{article.pubDate ? formatDistanceToNow(new Date(article.pubDate), { addSuffix: true }) : "Recently"}</span>
                          </div>
                          <h3 className="font-bold text-lg leading-snug mb-3 group-hover:text-blue-600 transition-colors line-clamp-2">
                            {emotionalizedContent[article.link]?.title || article.title}
                          </h3>
                          <p className="text-sm text-gray-500 line-clamp-3 mb-4 flex-1">
                            {emotionalizedContent[article.link]?.snippet || article.contentSnippet}
                          </p>
                          <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                            <div className="flex items-center gap-2">
                              {userEmotion && !emotionalizedContent[article.link] && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    emotionalizeArticle(article);
                                  }}
                                  disabled={isEmotionalizing[article.link]}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-[10px] font-bold uppercase tracking-wider text-gray-600 transition-all active:scale-95 disabled:opacity-50"
                                >
                                  {isEmotionalizing[article.link] ? (
                                    <RefreshCw size={12} className="animate-spin" />
                                  ) : (
                                    <>
                                      <Sparkles size={12} className="text-blue-500" />
                                      Emotionalize
                                    </>
                                  )}
                                </button>
                              )}
                              {emotionalizedContent[article.link] && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-full text-[10px] font-bold uppercase tracking-wider text-blue-600">
                                  <Sparkles size={12} />
                                  {userEmotion} Mode
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBookmark(article);
                                }}
                                className={cn(
                                  "p-2 rounded-full transition-colors",
                                  bookmarks.some(b => b.link === article.link) 
                                    ? "text-orange-500 bg-orange-50" 
                                    : "text-gray-400 hover:bg-gray-100"
                                )}
                              >
                                <Bookmark size={18} fill={bookmarks.some(b => b.link === article.link) ? "currentColor" : "none"} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(article.link, "_blank");
                                }}
                                className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                              >
                                <ExternalLink size={18} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search size={24} className="text-gray-400" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">No articles found</h3>
                  <p className="text-gray-500">Try adjusting your filters or search query.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Article Detail Modal */}
      <AnimatePresence>
        {selectedArticle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedArticle(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <span className="bg-gray-100 px-2 py-1 rounded text-[10px] font-bold uppercase text-gray-500">
                    {selectedArticle.source}
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto p-6 md:p-10 space-y-8">
                {!selectedArticle.imageUrl && (
                  <div className="rounded-3xl aspect-video bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-4 group/modal-empty relative overflow-hidden">
                    <Newspaper size={48} className="text-gray-200" />
                    <button 
                      onClick={() => generateImageForArticle(selectedArticle)}
                      disabled={selectedArticle.isGeneratingImage}
                      className="bg-white border border-gray-200 px-6 py-3 rounded-full font-bold hover:shadow-md transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                      {selectedArticle.isGeneratingImage ? (
                        <RefreshCw size={18} className="animate-spin" />
                      ) : (
                        <Sparkles size={18} className="text-blue-500" />
                      )}
                      {selectedArticle.isGeneratingImage ? "Finding/Generating..." : "Find or Generate Image"}
                    </button>
                    {selectedArticle.isGeneratingImage && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                        <RefreshCw size={32} className="text-blue-600 animate-spin" />
                      </div>
                    )}
                  </div>
                )}

                {selectedArticle.imageUrl && (
                  <div className="relative group/modal-img rounded-3xl overflow-hidden aspect-video bg-gray-100 border border-gray-100">
                    <img 
                      src={selectedArticle.imageUrl} 
                      alt={selectedArticle.title} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/modal-img:opacity-100 transition-opacity flex items-end p-6">
                      <div className="w-full flex gap-2">
                        <input 
                          type="text" 
                          id="refine-input"
                          placeholder="Refine this image with AI..." 
                          className="flex-1 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              generateImageForArticle(selectedArticle, e.currentTarget.value);
                              e.currentTarget.value = "";
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = document.getElementById('refine-input') as HTMLInputElement;
                            if (input && input.value) {
                              generateImageForArticle(selectedArticle, input.value);
                              input.value = "";
                            }
                          }}
                          className="bg-white text-black p-2 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                          <Sparkles size={18} />
                        </button>
                      </div>
                    </div>
                    {selectedArticle.isGeneratingImage && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                        <RefreshCw size={32} className="text-white animate-spin" />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <h2 className="text-3xl md:text-4xl font-black leading-tight">
                    {emotionalizedContent[selectedArticle.link]?.title || selectedArticle.title}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5"><Clock size={14} /> {selectedArticle.pubDate && new Date(selectedArticle.pubDate).toLocaleDateString()}</span>
                    {selectedArticle.author && <span>By {selectedArticle.author}</span>}
                    {userEmotion && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 rounded-full border border-gray-100">
                        <span className="text-lg">{(EMOTIONS.find(e => e.name === userEmotion))?.icon}</span>
                        <span className="font-bold uppercase tracking-wider text-[10px]">{userEmotion} Mode</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => summarizeArticle(selectedArticle)}
                    disabled={isSummarizing}
                    className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-full font-bold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50"
                  >
                    {isSummarizing ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    {isSummarizing ? "Analyzing..." : "AI Summary"}
                  </button>
                  <button 
                    onClick={() => toggleBookmark(selectedArticle)}
                    className="flex items-center gap-2 bg-gray-100 px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-all"
                  >
                    <Bookmark size={18} fill={bookmarks.some(b => b.link === selectedArticle.link) ? "black" : "none"} />
                    {bookmarks.some(b => b.link === selectedArticle.link) ? "Saved" : "Save"}
                  </button>
                  <button 
                    onClick={() => window.open(selectedArticle.link, "_blank")}
                    className="flex items-center gap-2 border border-gray-200 px-6 py-3 rounded-full font-bold hover:bg-gray-50 transition-all"
                  >
                    <ExternalLink size={18} />
                    Full Article
                  </button>
                </div>

                {summary && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100"
                  >
                    <div className="flex items-center gap-2 text-indigo-600 font-bold mb-3">
                      <Sparkles size={16} />
                      <span>AI Summary</span>
                    </div>
                    <div className="prose prose-indigo max-w-none text-indigo-900 leading-relaxed">
                      <Markdown>{summary}</Markdown>
                    </div>
                  </motion.div>
                )}

                <div className="text-lg text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {selectedArticle.contentSnippet || selectedArticle.content || "No preview available."}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white p-6 lg:hidden flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                    <Newspaper className="text-white" size={18} />
                  </div>
                  <h1 className="text-xl font-bold">PulsePoint</h1>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <nav className="flex-1 space-y-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-3 mb-4">Categories</p>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setActiveCategory(cat);
                      setSelectedFeed(null);
                      setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all text-sm font-medium",
                      activeCategory === cat && !selectedFeed
                        ? "bg-black text-white" 
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {cat === "All" && <LayoutGrid size={18} />}
                      {cat === "Bookmarks" && <Bookmark size={18} />}
                      {cat === "AI Tools" && <Sparkles size={18} />}
                      {cat !== "All" && cat !== "Bookmarks" && cat !== "AI Tools" && <ChevronRight size={16} className="opacity-50" />}
                      {cat}
                    </div>
                  </button>
                ))}
              </nav>

              {user && (
                <div className="mt-8 space-y-4 px-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">My Feeds</p>
                      <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {customFeeds.length}
                      </span>
                    </div>
                    <button 
                      onClick={() => setIsAddFeedOpen(true)}
                      className="p-1.5 bg-gray-100 rounded-full text-gray-600"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {customFeeds.map(feed => (
                      <div 
                        key={feed.id} 
                        onClick={() => {
                          setSelectedFeed(feed);
                          setActiveCategory(feed.category);
                          setIsSidebarOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer",
                          selectedFeed?.id === feed.id 
                            ? "bg-white border-black/10 shadow-sm ring-1 ring-black/5" 
                            : "bg-gray-50 border-gray-100"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-colors",
                            selectedFeed?.id === feed.id ? "bg-blue-500 text-white" : "bg-white text-blue-500"
                          )}>
                            <Newspaper size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className={cn(
                              "text-sm font-bold truncate",
                              selectedFeed?.id === feed.id ? "text-black" : "text-gray-700"
                            )}>{feed.title}</p>
                            <p className="text-[10px] text-gray-400 truncate">{feed.category}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeFeed(feed.id!)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {customFeeds.length === 0 && (
                      <div className="p-6 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <p className="text-xs text-gray-400 italic">No custom feeds yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t border-gray-100 mt-auto">
                {user ? (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
                    <img src={user.photoURL || ""} className="w-10 h-10 rounded-full" alt="" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{user.displayName}</p>
                      <button onClick={handleLogout} className="text-xs text-red-500 font-medium">Logout</button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="w-full bg-black text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                  >
                    <LogIn size={18} />
                    Login with Google
                  </button>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Floating Action Button (Mobile) */}
      <button 
        className="fixed bottom-6 right-6 lg:hidden w-14 h-14 bg-black text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95 z-40"
        onClick={() => setIsAddFeedOpen(true)}
      >
        <Plus size={24} />
      </button>

      {/* Add Feed Modal */}
      <AnimatePresence>
        {isAddFeedOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddFeedOpen(false);
                setPreviewItems([]);
                setPreviewError(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Add Custom Feed</h2>
                  <p className="text-sm text-gray-500">Enter an RSS URL to follow your favorite sources.</p>
                </div>
                <button 
                  onClick={() => setIsAddFeedOpen(false)} 
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
 
              <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-6 custom-scrollbar">
                <form onSubmit={handleAddFeed} className="space-y-5">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">RSS URL</label>
                      <div className="flex gap-2">
                        <input 
                          type="url" 
                          value={newFeedUrl}
                          onChange={(e) => setNewFeedUrl(e.target.value)}
                          placeholder="https://example.com/rss"
                          className="flex-1 bg-gray-50 border-2 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:border-black transition-all outline-none text-sm font-medium"
                          required
                        />
                        <button 
                          type="button"
                          onClick={handlePreviewFeed}
                          disabled={isPreviewing || !newFeedUrl}
                          className="px-6 bg-gray-100 hover:bg-gray-200 rounded-2xl font-bold text-sm transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {isPreviewing ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                          Preview
                        </button>
                      </div>
                      {previewError && <p className="text-xs text-red-500 mt-2 font-medium">{previewError}</p>}
                    </div>
 
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Feed Title</label>
                      <input 
                        type="text" 
                        value={newFeedTitle}
                        onChange={(e) => setNewFeedTitle(e.target.value)}
                        placeholder="e.g. My Tech News"
                        className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-5 py-4 focus:bg-white focus:border-black transition-all outline-none text-sm font-medium"
                        required
                      />
                    </div>
 
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Category</label>
                      <div className="grid grid-cols-3 gap-2">
                        {CATEGORIES.filter(c => c !== "All" && c !== "Bookmarks" && c !== "AI Tools").map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setNewFeedCategory(cat)}
                            className={cn(
                              "py-3 rounded-xl text-xs font-bold transition-all border-2",
                              newFeedCategory === cat 
                                ? "bg-black text-white border-black" 
                                : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100"
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
 
                  {previewItems.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-3 pt-4 border-t border-gray-100"
                    >
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Latest from this feed</p>
                      <div className="space-y-2">
                        {previewItems.map((item, i) => (
                          <div key={i} className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                            <p className="text-xs font-bold text-blue-900 line-clamp-1">{item.title}</p>
                            <p className="text-[10px] text-blue-700/70 mt-1 line-clamp-1">{item.contentSnippet}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
 
                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsAddFeedOpen(false)}
                      className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-[2] bg-black text-white py-4 rounded-2xl font-bold hover:shadow-xl hover:shadow-black/20 transition-all active:scale-[0.98]"
                    >
                      Add Feed
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
