// Theme configurations for gallery customization

// Helper function to determine if text should be light or dark based on background
export const getContrastTextColor = (hexColor) => {
  if (!hexColor) return '#1a1a1a';
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance using sRGB
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return white for dark backgrounds, dark for light backgrounds
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff';
};

// Helper to get appropriate text color for a specific background in a theme
export const getTextColorForBackground = (theme, bgType = 'background') => {
  const bgColor = theme.colors[bgType] || theme.colors.background;
  return getContrastTextColor(bgColor);
};

// Helper to get a lighter/darker variant of a color for subtle text
export const getSubtleTextColor = (hexColor, opacity = 0.6) => {
  const baseColor = getContrastTextColor(hexColor);
  // Return with opacity for subtle effect
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Professional Google Fonts to include in HTML head
export const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Manrope:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&family=Raleway:wght@300;400;500;600&family=Source+Sans+Pro:wght@300;400;600&family=Cinzel:wght@400;500;600&family=Bodoni+Moda:ital,wght@0,400;0,500;0,600;1,400&family=Space+Grotesk:wght@400;500;600&family=Quicksand:wght@400;500;600&display=swap";

export const themes = {
  // ============ CLASSIC & ELEGANT ============
  classic: {
    name: "Classic Elegance",
    description: "Timeless black & white minimal design",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1606115915090-be18fea23ec7?w=400&q=80",
    colors: {
      primary: "#18181b",
      secondary: "#f4f4f5",
      accent: "#18181b",
      background: "#ffffff",
      text: "#18181b",
      textLight: "#52525b"
    },
    fonts: {
      heading: "'Playfair Display', Georgia, serif",
      body: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif"
    }
  },
  
  romantic: {
    name: "Romantic Blush",
    description: "Soft pastels perfect for weddings",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400&q=80",
    colors: {
      primary: "#be185d",
      secondary: "#fff5f5",
      accent: "#be185d",
      background: "#fffbfb",
      text: "#5a3a3a",
      textLight: "#9d7d7d"
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Inter', sans-serif"
    }
  },

  vintage: {
    name: "Vintage Sepia",
    description: "Classic vintage feel with warm tones",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?w=400&q=80",
    colors: {
      primary: "#92400e",
      secondary: "#fef3c7",
      accent: "#92400e",
      background: "#fffbeb",
      text: "#78350f",
      textLight: "#b45309"
    },
    fonts: {
      heading: "'Bodoni Moda', serif",
      body: "'Crimson Text', serif"
    }
  },

  lavender: {
    name: "Lavender Dreams",
    description: "Soft purple for elegant gatherings",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1468327768560-75b778cbb551?w=400&q=80",
    colors: {
      primary: "#7c3aed",
      secondary: "#f5f3ff",
      accent: "#7c3aed",
      background: "#ffffff",
      text: "#4c1d95",
      textLight: "#6d28d9"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Raleway', sans-serif"
    }
  },

  // ============ DARK & MOODY ============
  modern: {
    name: "Modern Dark",
    description: "Bold and contemporary with dark aesthetic",
    category: "dark",
    preview: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&q=80",
    colors: {
      primary: "#0f172a",
      secondary: "#1e293b",
      accent: "#3b82f6",
      background: "#0a0f1e",
      text: "#f8fafc",
      textLight: "#cbd5e1"
    },
    fonts: {
      heading: "'Space Grotesk', sans-serif",
      body: "'Inter', sans-serif"
    }
  },

  neon: {
    name: "Neon Nights",
    description: "Electric vibes for club & nightlife",
    category: "dark",
    preview: "https://images.unsplash.com/photo-1557683316-973673baf926?w=400&q=80",
    colors: {
      primary: "#a855f7",
      secondary: "#1e1b4b",
      accent: "#a855f7",
      background: "#0f0a24",
      text: "#e9d5ff",
      textLight: "#c084fc"
    },
    fonts: {
      heading: "'Orbitron', sans-serif",
      body: "'Exo 2', sans-serif"
    }
  },

  blackgold: {
    name: "Black & Gold",
    description: "Luxurious and opulent for VIP events",
    category: "dark",
    preview: "https://images.unsplash.com/photo-1579547621113-e4bb2a19bdd6?w=400&q=80",
    colors: {
      primary: "#d4af37",
      secondary: "#1a1a1a",
      accent: "#d4af37",
      background: "#0d0d0d",
      text: "#ffffff",
      textLight: "#d4af37"
    },
    fonts: {
      heading: "'Cinzel', serif",
      body: "'Cormorant Garamond', serif"
    }
  },

  midnight: {
    name: "Midnight Blue",
    description: "Deep navy with silver accents",
    category: "dark",
    preview: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=400&q=80",
    colors: {
      primary: "#1e3a5f",
      secondary: "#0f1729",
      accent: "#60a5fa",
      background: "#0a1628",
      text: "#e2e8f0",
      textLight: "#94a3b8"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Inter', sans-serif"
    }
  },

  // ============ NATURE & EARTHY ============
  nature: {
    name: "Natural Earth",
    description: "Warm earthy tones for outdoor events",
    category: "nature",
    preview: "https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5?w=400&q=80",
    colors: {
      primary: "#57534e",
      secondary: "#fafaf9",
      accent: "#57534e",
      background: "#ffffff",
      text: "#44403c",
      textLight: "#78716c"
    },
    fonts: {
      heading: "'Merriweather', serif",
      body: "'Work Sans', sans-serif"
    }
  },

  garden: {
    name: "Spring Garden",
    description: "Fresh greens for outdoor celebrations",
    category: "nature",
    preview: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=400&q=80",
    colors: {
      primary: "#15803d",
      secondary: "#f0fdf4",
      accent: "#15803d",
      background: "#ffffff",
      text: "#14532d",
      textLight: "#166534"
    },
    fonts: {
      heading: "'Libre Baskerville', serif",
      body: "'Source Sans Pro', sans-serif"
    }
  },

  ocean: {
    name: "Ocean Breeze",
    description: "Cool blues perfect for beach weddings",
    category: "nature",
    preview: "https://images.unsplash.com/photo-1505142468610-359e7d316be0?w=400&q=80",
    colors: {
      primary: "#0369a1",
      secondary: "#f0f9ff",
      accent: "#0369a1",
      background: "#ffffff",
      text: "#0c4a6e",
      textLight: "#0369a1"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Inter', sans-serif"
    }
  },

  tropical: {
    name: "Tropical Paradise",
    description: "Vibrant colors for summer events",
    category: "nature",
    preview: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80",
    colors: {
      primary: "#0891b2",
      secondary: "#ecfeff",
      accent: "#0891b2",
      background: "#ffffff",
      text: "#164e63",
      textLight: "#0891b2"
    },
    fonts: {
      heading: "'Fredoka', sans-serif",
      body: "'Quicksand', sans-serif"
    }
  },

  forest: {
    name: "Enchanted Forest",
    description: "Deep greens with gold accents",
    category: "nature",
    preview: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=80",
    colors: {
      primary: "#14532d",
      secondary: "#f0fdf4",
      accent: "#14532d",
      background: "#ffffff",
      text: "#052e16",
      textLight: "#166534"
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Lato', sans-serif"
    }
  },

  // ============ WARM & VIBRANT ============
  sunset: {
    name: "Golden Sunset",
    description: "Warm golden hues for evening events",
    category: "warm",
    preview: "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&q=80",
    colors: {
      primary: "#b45309",
      secondary: "#fffbeb",
      accent: "#b45309",
      background: "#ffffff",
      text: "#78350f",
      textLight: "#b45309"
    },
    fonts: {
      heading: "'Lora', serif",
      body: "'Open Sans', sans-serif"
    }
  },

  party: {
    name: "Party Vibes",
    description: "Bold & fun for birthday parties",
    category: "warm",
    preview: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400&q=80",
    colors: {
      primary: "#db2777",
      secondary: "#fdf2f8",
      accent: "#db2777",
      background: "#ffffff",
      text: "#831843",
      textLight: "#be185d"
    },
    fonts: {
      heading: "'Poppins', sans-serif",
      body: "'Nunito', sans-serif"
    }
  },

  terracotta: {
    name: "Terracotta Dreams",
    description: "Warm clay tones for boho weddings",
    category: "warm",
    preview: "https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?w=400&q=80",
    colors: {
      primary: "#c2410c",
      secondary: "#fff7ed",
      accent: "#c2410c",
      background: "#ffffff",
      text: "#7c2d12",
      textLight: "#c2410c"
    },
    fonts: {
      heading: "'DM Serif Display', serif",
      body: "'DM Sans', sans-serif"
    }
  },

  coral: {
    name: "Coral Reef",
    description: "Vibrant coral for beach celebrations",
    category: "warm",
    preview: "https://images.unsplash.com/photo-1546026423-cc4642628d2b?w=400&q=80",
    colors: {
      primary: "#e11d48",
      secondary: "#fff1f2",
      accent: "#e11d48",
      background: "#ffffff",
      text: "#9f1239",
      textLight: "#e11d48"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Nunito', sans-serif"
    }
  },

  // ============ PROFESSIONAL ============
  corporate: {
    name: "Corporate Professional",
    description: "Clean & professional for business events",
    category: "professional",
    preview: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80",
    colors: {
      primary: "#1d4ed8",
      secondary: "#eff6ff",
      accent: "#1d4ed8",
      background: "#ffffff",
      text: "#1e3a8a",
      textLight: "#3b82f6"
    },
    fonts: {
      heading: "'Roboto', sans-serif",
      body: "'Open Sans', sans-serif"
    }
  },

  minimalist: {
    name: "Ultra Minimal",
    description: "Clean lines, maximum focus on photos",
    category: "professional",
    preview: "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=400&q=80",
    colors: {
      primary: "#404040",
      secondary: "#fafafa",
      accent: "#404040",
      background: "#ffffff",
      text: "#171717",
      textLight: "#525252"
    },
    fonts: {
      heading: "'Helvetica Neue', sans-serif",
      body: "'Helvetica Neue', sans-serif"
    }
  },

  slate: {
    name: "Slate Professional",
    description: "Modern slate grey for corporate events",
    category: "professional",
    preview: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&q=80",
    colors: {
      primary: "#334155",
      secondary: "#f1f5f9",
      accent: "#334155",
      background: "#ffffff",
      text: "#1e293b",
      textLight: "#475569"
    },
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif"
    }
  },

  // ============ SEASONAL ============
  christmas: {
    name: "Holiday Cheer",
    description: "Festive red & green for holidays",
    category: "seasonal",
    preview: "https://images.unsplash.com/photo-1512389142860-9c449e58a814?w=400&q=80",
    colors: {
      primary: "#dc2626",
      secondary: "#fef2f2",
      accent: "#dc2626",
      background: "#ffffff",
      text: "#991b1b",
      textLight: "#166534"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Lato', sans-serif"
    }
  },

  autumn: {
    name: "Autumn Harvest",
    description: "Rich fall colors for autumn events",
    category: "seasonal",
    preview: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
    colors: {
      primary: "#9a3412",
      secondary: "#fef3c7",
      accent: "#9a3412",
      background: "#fffbeb",
      text: "#7c2d12",
      textLight: "#b45309"
    },
    fonts: {
      heading: "'Merriweather', serif",
      body: "'Source Sans Pro', sans-serif"
    }
  },

  spring: {
    name: "Cherry Blossom",
    description: "Soft pink for spring celebrations",
    category: "seasonal",
    preview: "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=400&q=80",
    colors: {
      primary: "#db2777",
      secondary: "#fdf2f8",
      accent: "#db2777",
      background: "#ffffff",
      text: "#831843",
      textLight: "#be185d"
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Quicksand', sans-serif"
    }
  },

  // ============ NEW ADOBE-INSPIRED PALETTES ============
  dustyrose: {
    name: "Dusty Rose",
    description: "Muted mauve tones for sophisticated weddings",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?w=400&q=80",
    colors: {
      primary: "#9d174d",
      secondary: "#fdf2f8",
      accent: "#9d174d",
      background: "#ffffff",
      text: "#831843",
      textLight: "#be185d"
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Lato', sans-serif"
    }
  },

  sage: {
    name: "Sage & Ivory",
    description: "Soft sage green with cream accents",
    category: "nature",
    preview: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=400&q=80",
    colors: {
      primary: "#4d7c0f",
      secondary: "#f7fee7",
      accent: "#4d7c0f",
      background: "#fefef5",
      text: "#365314",
      textLight: "#65a30d"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Nunito', sans-serif"
    }
  },

  burgundy: {
    name: "Burgundy Wine",
    description: "Deep wine red for elegant affairs",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&q=80",
    colors: {
      primary: "#7f1d1d",
      secondary: "#fef2f2",
      accent: "#7f1d1d",
      background: "#fffbfb",
      text: "#450a0a",
      textLight: "#991b1b"
    },
    fonts: {
      heading: "'Cinzel', serif",
      body: "'Cormorant Garamond', serif"
    }
  },

  navy: {
    name: "Navy & Blush",
    description: "Classic navy with blush pink accents",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80",
    colors: {
      primary: "#1e3a8a",
      secondary: "#eff6ff",
      accent: "#1e3a8a",
      background: "#ffffff",
      text: "#1e3a8a",
      textLight: "#3b82f6"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Inter', sans-serif"
    }
  },

  emerald: {
    name: "Emerald Elegance",
    description: "Rich emerald green for luxury events",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80",
    colors: {
      primary: "#047857",
      secondary: "#ecfdf5",
      accent: "#047857",
      background: "#ffffff",
      text: "#064e3b",
      textLight: "#059669"
    },
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Raleway', sans-serif"
    }
  },

  mocha: {
    name: "Mocha & Cream",
    description: "Warm coffee tones for cozy celebrations",
    category: "warm",
    preview: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&q=80",
    colors: {
      primary: "#78350f",
      secondary: "#fef3c7",
      accent: "#78350f",
      background: "#fffbeb",
      text: "#451a03",
      textLight: "#92400e"
    },
    fonts: {
      heading: "'Lora', serif",
      body: "'Source Sans Pro', sans-serif"
    }
  },

  arctic: {
    name: "Arctic Frost",
    description: "Cool icy blues for winter weddings",
    category: "nature",
    preview: "https://images.unsplash.com/photo-1478719059408-592965723cbc?w=400&q=80",
    colors: {
      primary: "#0284c7",
      secondary: "#f0f9ff",
      accent: "#0284c7",
      background: "#ffffff",
      text: "#075985",
      textLight: "#0ea5e9"
    },
    fonts: {
      heading: "'Raleway', sans-serif",
      body: "'Open Sans', sans-serif"
    }
  },

  marigold: {
    name: "Marigold Fields",
    description: "Bright golden yellow for joyful events",
    category: "warm",
    preview: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=400&q=80",
    colors: {
      primary: "#a16207",
      secondary: "#fef9c3",
      accent: "#a16207",
      background: "#fffef5",
      text: "#713f12",
      textLight: "#ca8a04"
    },
    fonts: {
      heading: "'DM Serif Display', serif",
      body: "'DM Sans', sans-serif"
    }
  },

  plum: {
    name: "Plum Perfect",
    description: "Deep plum purple for romantic events",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=400&q=80",
    colors: {
      primary: "#6b21a8",
      secondary: "#faf5ff",
      accent: "#6b21a8",
      background: "#ffffff",
      text: "#581c87",
      textLight: "#9333ea"
    },
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Quicksand', sans-serif"
    }
  },

  rosegold: {
    name: "Rose Gold",
    description: "Luxurious rose gold for glamorous events",
    category: "elegant",
    preview: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=400&q=80",
    colors: {
      primary: "#be123c",
      secondary: "#fff1f2",
      accent: "#be123c",
      background: "#fffbfc",
      text: "#881337",
      textLight: "#e11d48"
    },
    fonts: {
      heading: "'Cinzel', serif",
      body: "'Lato', sans-serif"
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

// Get all themes grouped by category
export const getThemesByCategory = () => {
  const categories = {
    elegant: { name: 'Elegant & Classic', themes: [] },
    dark: { name: 'Dark & Moody', themes: [] },
    nature: { name: 'Nature & Earthy', themes: [] },
    warm: { name: 'Warm & Vibrant', themes: [] },
    professional: { name: 'Professional', themes: [] },
    seasonal: { name: 'Seasonal', themes: [] }
  };

  Object.entries(themes).forEach(([key, theme]) => {
    const category = theme.category || 'elegant';
    if (categories[category]) {
      categories[category].themes.push({ key, ...theme });
    }
  });

  return categories;
};
