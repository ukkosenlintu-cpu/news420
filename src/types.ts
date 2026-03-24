export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
}

export interface FeedSource {
  id: string;
  url: string;
  title: string;
  category: string;
  addedBy: string;
  createdAt: string;
}

export interface Article {
  title: string;
  link: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  author?: string;
  categories?: string[];
  isoDate?: string;
  source?: string;
  category?: string;
  imageUrl?: string;
  isGeneratingImage?: boolean;
}

export interface Bookmark {
  id: string;
  uid: string;
  title: string;
  link: string;
  pubDate?: string;
  source?: string;
  contentSnippet?: string;
  createdAt: string;
}
