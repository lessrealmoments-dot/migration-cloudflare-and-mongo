# EventsGallery.vip - Comprehensive Platform Analysis

## Executive Summary
EventsGallery is a B2B SaaS platform for **event photographers** in the Philippines. It enables photographers to create beautiful online galleries for their clients (wedding guests, event attendees) to view and download photos. The platform operates on a **credit-based subscription model** with manual payment processing.

---

## 1. PLATFORM OVERVIEW

### What It Does
- **Photo Gallery Hosting**: Photographers create event galleries (weddings, birthdays, corporate events)
- **Guest Access**: Event attendees view/download photos via shareable links or QR codes
- **Collaboration**: External contributors (second shooters, videographers) can upload via special links
- **Live Display**: Slideshow and live collage modes for event venues
- **Video Integration**: YouTube video sections for videographers

### Target Market
- **Primary**: Event photographers in the Philippines (weddings, debuts, corporate events)
- **Secondary**: Photography studios and teams
- **End Users**: Event guests who view/download photos

### Tech Stack
- Frontend: React.js with Tailwind CSS
- Backend: FastAPI (Python)
- Database: MongoDB Atlas
- Storage: Cloudflare R2 (CDN: cdn.eventsgallery.vip)
- Hosting: Self-managed VPS (Hostinger KVM)
- Integrations: Google Drive, pCloud, YouTube, Resend (email)

---

## 2. CURRENT PRICING STRUCTURE

### Subscription Plans

| Plan | Monthly Price | Event Credits | Storage | Gallery Expiration |
|------|---------------|---------------|---------|-------------------|
| **Free** | ₱0 | 1 demo gallery | 500 MB | 6 hours |
| **Standard** | ₱1,000/mo (~$17 USD) | 2 credits | 10 GB | 6 months |
| **Pro** | ₱1,500/mo (~$26 USD) | 2 credits | 10 GB | 6 months |

### Extra Credits
- **₱500 per credit** (~$8.60 USD)
- Valid for current billing cycle only (don't roll over monthly, but have 12-month expiration)

### Feature Comparison

| Feature | Free | Standard | Pro |
|---------|------|----------|-----|
| Create Galleries | 1 demo only | ✅ | ✅ |
| QR Code Sharing | ✅ | ✅ | ✅ |
| Online Public Gallery | ✅ | ✅ | ✅ |
| Guest Photo Uploads | ✅ | ✅ | ✅ |
| Guest Downloads | ✅ | ✅ | ✅ |
| **Display Mode** (Slideshow/Collage) | ✅ (6hr only) | ❌ | ✅ |
| **Contributor Links** (2nd shooters) | ✅ (6hr only) | ❌ | ✅ |
| Video Sections (YouTube) | ✅ | ✅ | ✅ |
| Google Drive/pCloud Integration | ✅ | ✅ | ✅ |

### Admin Override Modes (Special Access)
Used for VIP customers, beta testers, and partnerships:

| Mode | Effective Plan | Credits | Storage | Expiration |
|------|----------------|---------|---------|------------|
| Founders Circle | Pro | Unlimited (999) | Unlimited | Never |
| Early Partner Beta | Pro | 2/month | 50 GB | 6 months |
| Comped Pro | Pro | 2/month | 50 GB | 6 months |
| Comped Standard | Standard | 2/month | 20 GB | 3 months |
| Enterprise Access | Pro | Unlimited | Unlimited | Never |

---

## 3. CREDIT SYSTEM EXPLAINED

### How Credits Work
1. **1 Credit = 1 Event Gallery**
   - Deducted when photographer creates a new gallery
   - Cannot be recovered if gallery is deleted
   
2. **Credit Hierarchy** (when creating gallery):
   - System uses **Extra Credits first** (purchased credits)
   - Then uses **Event Credits** (monthly subscription credits)
   
3. **Monthly Reset**:
   - Event credits reset to plan allocation each billing cycle
   - **Credits DO NOT roll over** month to month
   - Extra credits have 12-month expiration from purchase

4. **Free Plan Special Case**:
   - Gets 1 "demo gallery" (not a credit)
   - Demo gallery expires in 6 hours
   - Cannot create additional galleries

### Credit Economics
- Standard/Pro both get **2 credits/month** = 2 events
- If photographer does 3 events/month, they need 1 extra credit (₱500)
- Annual value at 2 events/month:
  - Standard: ₱12,000/year
  - Pro: ₱18,000/year

---

## 4. BILLING & PAYMENT SYSTEM

### Current State: "Soft Launch" / Manual Processing

**Payment Methods Configured:**
1. **GCash** - Mobile wallet (most popular in PH)
2. **Maya** - Mobile wallet
3. **Bank Transfer** - Land Bank

**Payment Flow:**
1. User selects plan on Pricing page
2. Modal shows payment instructions + QR codes
3. User sends money via GCash/Maya/Bank
4. User uploads screenshot of payment as "proof"
5. Admin receives notification in dashboard
6. Admin manually verifies payment
7. Admin clicks "Approve" or "Reject"
8. On approval: Plan activated, credits granted

**Download Lock:**
- While payment is "pending", guest downloads are disabled
- Prevents users from using service before payment confirmation

**Billing Enforcement:**
- Currently **DISABLED** (`billing_enforcement_enabled: false`)
- When enabled, would restrict features for unpaid users

---

## 5. CURRENT BUSINESS METRICS

### Client Base (as of Feb 2026)
```
Total Registered Users: 72

Plan Distribution:
  - Free: 62 (86%)
  - Standard: 3 (4%)
  - Pro: 7 (10%)

Override Users:
  - Founders Circle: 1
  - Regular Users: 71
```

### Revenue Analysis
```
Total Revenue: ₱16,500 (~$284 USD)

By Transaction Type:
  - Plan Upgrades: ₱14,500 (88%)
  - Extra Credits: ₱2,000 (12%)

Transaction History:
  - Approved: 16 transactions
  - Rejected: 1 transaction
  - Pending: Variable
```

### Platform Usage
```
Total Active Galleries: 105
Total Storage Used: 0.17 GB
Average Galleries per Paying User: ~10.5
```

### Conversion Metrics
- Free to Paid Conversion: **14%** (10 paid out of 72 total)
- Standard vs Pro Split: 30% Standard, 70% Pro
- Extra Credit Purchases: 4 transactions (suggests some users need more than 2 events/month)

---

## 6. FEATURE DEEP DIVE

### Gallery Features
- **Sections**: Organize photos by event parts (Ceremony, Reception, etc.)
- **Themes**: Multiple visual themes (Classic, Modern, Neon, etc.)
- **Cover Photos**: Custom hero images for galleries
- **Photo Management**: Hide, flag, delete individual photos
- **Bulk Actions**: Multi-select for batch operations

### Sharing & Distribution
- **Share Links**: Unique URLs for each gallery
- **QR Codes**: Generated for physical printing/display
- **Password Protection**: Optional download passwords
- **Section Downloads**: Download by section or all photos
- **ZIP Splitting**: Auto-split downloads over 250MB

### Display Modes (Pro Feature)
- **Slideshow**: Auto-advancing photo slideshow for venue TVs
- **Live Collage**: Dynamic grid that updates as photos are uploaded
- Both designed for wedding reception displays

### Collaboration Features (Pro Feature)
- **Contributor Links**: Unique URLs for second shooters to upload
- **Videographer Links**: Separate links for video uploads
- **Source Tracking**: Track which contributor uploaded which photos

### Integrations
- **Google Drive**: Link external folders, sync automatically
- **pCloud**: Same as Google Drive
- **YouTube**: Embed videos in video sections
- **Resend**: Transactional emails (notifications, approvals)

### Admin Capabilities
- **Client Management**: View all users, their plans, usage
- **Manual Plan Changes**: Upgrade/downgrade users
- **Credit Grants**: Add bonus credits
- **Override Modes**: Assign VIP access
- **Billing Review**: Approve/reject payments
- **Analytics**: Usage statistics

---

## 7. COMPETITIVE LANDSCAPE

### Direct Competitors (Philippines)
- Traditional: Photographers use Google Drive/Dropbox + manual sharing
- Some use international platforms (Pixieset, Pic-Time, ShootProof)

### International Platforms (Reference Pricing)
| Platform | Starting Price | Per-Event Model? |
|----------|---------------|------------------|
| Pixieset | $10/mo (1 client gallery) | No, storage-based |
| Pic-Time | $20/mo (unlimited) | No, flat rate |
| ShootProof | $10/mo (100 photos) | Photo count based |
| Cloudspot | $12/mo | Storage-based |

### EventsGallery Differentiators
1. **Philippine peso pricing** - No forex complications
2. **Local payment methods** - GCash/Maya (not common in intl. platforms)
3. **Event credit model** - Pay per event, not storage
4. **Live display modes** - Built-in slideshow/collage for venues
5. **Contributor collaboration** - Built for team photography

---

## 8. PRICING ANALYSIS & OBSERVATIONS

### Current Pricing Strengths
1. **Simple mental model**: 1 credit = 1 event
2. **Low entry point**: ₱1,000/mo is affordable for PH market
3. **Clear Pro upgrade path**: Display mode is compelling for wedding photographers

### Current Pricing Weaknesses
1. **Low credit count**: 2 events/month is limiting for active photographers
2. **No annual discount**: Missing opportunity for commitment/cash flow
3. **Pro vs Standard gap**: Only ₱500 difference but significant feature gap
4. **No tiered storage**: Both paid plans have same 10GB

### Revenue Optimization Opportunities
1. **Increase credits** for higher plans (e.g., Standard: 3, Pro: 5)
2. **Annual plans** with discount (e.g., pay 10 months, get 12)
3. **Volume pricing** for extra credits (buy 5 get 1 free)
4. **Storage tiers** for photographers with large events
5. **Team plans** for photography studios
6. **Per-download pricing** for high-volume guest downloads

### Pricing Psychology Notes
- ₱1,500 Pro is ~1 hour of photographer's event rate
- Extra credit at ₱500 is reasonable "per event" cost
- Free tier converts 14% - healthy but could improve with better onboarding

---

## 9. TECHNICAL CONSIDERATIONS FOR PRICING

### Cost Factors
1. **Storage (Cloudflare R2)**: ~$0.015/GB/month
2. **Bandwidth**: R2 has free egress (major cost saver)
3. **MongoDB Atlas**: Based on data size
4. **VPS Hosting**: Fixed cost (~$20-50/month)
5. **Email (Resend)**: Per-email pricing

### Margin Analysis
At current pricing with ~100 active galleries and 0.17GB storage:
- Storage cost: Negligible (~$0.003/month)
- Main costs: Hosting + development time
- Revenue: ₱16,500 lifetime = ~$284
- Platform is in early growth stage, not yet profitable

---

## 10. USER JOURNEY MAPPING

### Photographer Journey
1. **Discovery**: Finds platform (word of mouth, search)
2. **Trial**: Creates free demo gallery (6 hours)
3. **Evaluation**: Tests features, shares with test guests
4. **Decision Point**: Demo expires, prompted to upgrade
5. **Conversion**: Chooses Standard or Pro
6. **Payment**: GCash/Maya/Bank → uploads proof
7. **Activation**: Admin approves, plan activated
8. **Usage**: Creates event galleries, shares with clients
9. **Growth**: Buys extra credits for busy months
10. **Retention**: Monthly renewal (manual currently)

### Guest Journey
1. **Receives link**: From photographer (email/message/QR)
2. **Views gallery**: Beautiful public gallery experience
3. **Browses photos**: Sections, highlights, search
4. **Downloads**: Individual or batch downloads
5. **Uploads (optional)**: Guest contributions
6. **Shares**: Social sharing of favorite photos

---

## 11. KEY QUESTIONS FOR PRICING AI

When analyzing this data, consider:

1. **Market Context**: This is Philippines market where:
   - Average monthly income: ~₱20,000-40,000
   - Wedding photographer day rate: ₱15,000-50,000
   - Competitors charge in USD (forex adds 30%+ cost)

2. **Usage Patterns**:
   - Active photographers do 2-4 events/month
   - Wedding season peaks: Jan-May, Oct-Dec
   - Slow season: June-Sept (monsoon)

3. **Feature Value**:
   - Display mode is HIGHLY valued (venue presentations)
   - Contributor links save coordination time
   - QR codes are standard expectation now

4. **Growth Goals**:
   - Increase paid conversion from 14%
   - Increase average revenue per user
   - Reduce admin overhead (manual payments)

5. **Questions to Answer**:
   - Should Standard include more features to reduce Pro gap?
   - Is 2 credits/month the right baseline?
   - Should there be a higher tier (Business/Studio)?
   - What annual pricing would optimize retention?
   - Should extra credits be cheaper in bulk?

---

## 12. RAW DATA APPENDIX

### Current Pricing Configuration
```json
{
  "pricing": {
    "standard_monthly": 1000,
    "pro_monthly": 1500,
    "extra_credit": 500
  },
  "paid_gallery_expiration_months": 6,
  "paid_storage_limit_gb": -1 (unlimited)
}
```

### Payment Methods
```json
{
  "gcash": { "enabled": true, "name": "GCash" },
  "maya": { "enabled": true, "name": "Maya" },
  "bank": { "enabled": true, "name": "Bank Transfer", "bank_name": "Land Bank" }
}
```

### Plan Credits
```python
PLAN_CREDITS = {
    "free": 0,      # Demo only
    "standard": 2,  # 2 events/month
    "pro": 2        # 2 events/month
}
```

### Default Storage Quotas
```python
FREE_STORAGE = 500 MB
STANDARD_STORAGE = 10 GB
PRO_STORAGE = 10 GB
```

### Gallery Expiration
```
Free: 6 hours
Standard: 6 months
Pro: 6 months
Founders: 100 years (never)
```

---

*Document generated: February 2026*
*Platform: EventsGallery.vip*
*Analysis by: AI Development Assistant*
