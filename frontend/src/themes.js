// Theme configurations for gallery customization
export const themes = {
  classic: {
    name: "Classic Elegance",
    description: "Timeless black & white minimal design",
    preview: "https://images.unsplash.com/photo-1606115915090-be18fea23ec7?w=400&q=80",
    colors: {
      primary: "#18181b",
      secondary: "#f4f4f5",
      accent: "#71717a",
      background: "#ffffff",
      text: "#18181b",
      textLight: "#71717a"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Manrope', sans-serif"
    }
  },
  
  romantic: {
    name: "Romantic Blush",
    description: "Soft pastels perfect for weddings",
    preview: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400&q=80",
    colors: {
      primary: "#d4a5a5",
      secondary: "#fff5f5",
      accent: "#f4c2c2",
      background: "#fffbfb",
      text: "#5a3a3a",
      textLight: "#9d7d7d"
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Inter', sans-serif"
    }
  },
  
  modern: {
    name: "Modern Dark",
    description: "Bold and contemporary with dark aesthetic",
    preview: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&q=80",
    colors: {
      primary: "#0f172a",
      secondary: "#1e293b",
      accent: "#64748b",
      background: "#0a0f1e",
      text: "#f8fafc",
      textLight: "#cbd5e1"
    },
    fonts: {
      heading: "'Space Grotesk', sans-serif",
      body: "'Inter', sans-serif"
    }
  },
  
  nature: {
    name: "Natural Earth",
    description: "Warm earthy tones for outdoor events",
    preview: "https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5?w=400&q=80",
    colors: {
      primary: "#78716c",
      secondary: "#fafaf9",
      accent: "#a8a29e",
      background: "#ffffff",
      text: "#44403c",
      textLight: "#78716c"
    },
    fonts: {
      heading: "'Merriweather', serif",
      body: "'Work Sans', sans-serif"
    }
  },
  
  ocean: {
    name: "Ocean Breeze",
    description: "Cool blues perfect for beach weddings",
    preview: "https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=400&q=80",
    colors: {
      primary: "#0ea5e9",
      secondary: "#f0f9ff",
      accent: "#38bdf8",
      background: "#ffffff",
      text: "#0c4a6e",
      textLight: "#0369a1"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Inter', sans-serif"
    }
  },
  
  vintage: {
    name: "Vintage Sepia",
    description: "Classic vintage feel with warm tones",
    preview: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?w=400&q=80",
    colors: {
      primary: "#92400e",
      secondary: "#fef3c7",
      accent: "#d97706",
      background: "#fffbeb",
      text: "#78350f",
      textLight: "#b45309"
    },
    fonts: {
      heading: "'Bodoni Moda', serif",
      body: "'Crimson Text', serif"
    }
  }
};

export const getThemeStyles = (themeName) => {
  const theme = themes[themeName] || themes.classic;
  return {
    '--theme-primary': theme.colors.primary,
    '--theme-secondary': theme.colors.secondary,
    '--theme-accent': theme.colors.accent,
    '--theme-background': theme.colors.background,
    '--theme-text': theme.colors.text,
    '--theme-text-light': theme.colors.textLight,
    '--theme-font-heading': theme.fonts.heading,
    '--theme-font-body': theme.fonts.body
  };
};
