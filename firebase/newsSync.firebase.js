// services/firebaseSync.js
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { db } from "../config/firebaseConfig.js";

export const syncNewsToFirebase = async (newsDoc) => {
    try {
        const ref = doc(db, "news", newsDoc._id.toString());
        await setDoc(ref, {
            heading: newsDoc.heading,
            subheading: newsDoc.subheading,
            description: newsDoc.description,
            excerpt: newsDoc.excerpt,
            author: newsDoc.author,
            image: newsDoc.image,
            createdBy: newsDoc.createdBy?.toString() || null,
            category: newsDoc.category?.toString() || null,
            tags: newsDoc.tags?.map(t => t.toString()),
            slug: newsDoc.slug,
            status: newsDoc.status,
            publishedAt: newsDoc.publishedAt,
            isFeatured: newsDoc.isFeatured,
            metaTitle: newsDoc.metaTitle,
            metaDescription: newsDoc.metaDescription,
            metaKeywords: newsDoc.metaKeywords,
            canonicalUrl: newsDoc.canonicalUrl,
            credibilityScore: newsDoc.credibilityScore,
            ogTitle: newsDoc.ogTitle,
            ogDescription: newsDoc.ogDescription,
            ogImage: newsDoc.ogImage,
            sourceUrl: newsDoc.sourceUrl,
            createdAt: new Date().toISOString(),
        });
        console.log("✅ Synced to Firebase:", newsDoc.heading);
    } catch (error) {
        console.error("🔥 Firebase sync error:", error.message);
    }
};



// syncing tags
export const syncTagToFirebase = async (tagDoc) => {
    try {
        const ref = doc(db, "tags", tagDoc._id.toString());
        await setDoc(ref, {
            name: tagDoc.name,
            slug: tagDoc.slug,
            usageCount: tagDoc.usageCount,
            createdAt: tagDoc.createdAt || new Date().toISOString(),
        });
        console.log("✅ Synced Tag:", tagDoc.name);
    } catch (error) {
        console.error("🔥 Firebase sync error (tag):", error.message);
    }
};


export const syncCategoryToFirebase = async (catDoc) => {
    try {
        const ref = doc(db, "categories", catDoc._id.toString());

        await setDoc(ref, {
            name: catDoc.name,
            slug: catDoc.slug,
            description: catDoc.description,
            parent: catDoc.parent ? catDoc.parent.toString() : null,   // FIX
            icon: catDoc.icon || null,
            banner: catDoc.banner || null,
            metaTitle: catDoc.metaTitle || null,
            metaDescription: catDoc.metaDescription || null,
            isFeatured: catDoc.isFeatured ?? false,
            createdBy: catDoc.createdBy?.toString() || null,
            createdAt: catDoc.createdAt?.toISOString?.() || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        console.log("✅ Synced Category:", catDoc.name);
    } catch (error) {
        console.error("🔥 Firebase sync error (category):", error.message);
    }
};



export const deleteCategoryFromFirebase = async (ids) => {
    try {
        if (!ids) return;

        const idArray = Array.isArray(ids) ? ids : [ids];

        for (const id of idArray) {
            const catRef = doc(db, "categories", id);
            await deleteDoc(catRef);
        }

        console.log(`🔥 Deleted ${idArray.length} category item(s) from Firebase`);
    } catch (error) {
        console.error("🔥 Firebase delete failed:", error.message);
        throw error;
    }
};


export const deleteNewsFromFirebase = async (ids) => {
    try {
        if (!ids) return;

        const idArray = Array.isArray(ids) ? ids : [ids];

        for (const id of idArray) {
            const newsRef = doc(db, "news", id);
            await deleteDoc(newsRef);
        }

        console.log(`🔥 Deleted ${idArray.length} news item(s) from Firebase`);
    } catch (error) {
        console.error("🔥 Firebase delete failed:", error.message);
        throw error;
    }
};

