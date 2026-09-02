import { doc, setDoc } from "firebase/firestore"
import { db } from "../config/firebaseConfig.js" // adjust path if needed

/**
 * Syncs a comment to Firebase (Firestore)
 * so that frontend gets realtime updates
 */
export const syncNewsComment = async (newsId, comment) => {
    try {
        if (!newsId || !comment?._id) return;

        const ref = doc(db, "newsComments", `${newsId.toString()}_${comment._id.toString()}`);

        await setDoc(ref, {
            newsId,
            commentId: comment._id.toString(),
            userId: comment.userId || null,
            anonymousId: comment.anonymousId || null,
            commentText: comment.commentText,
            parentCommentId: comment.parentCommentId || null,
            likesCount: comment.likesCount || 0,
            createdAt: comment.createdAt?.toISOString?.() || new Date().toISOString(),
        });

        console.log("✅ Synced comment to Firebase:", comment._id);
    } catch (error) {
        console.log("🔥 Firebase sync error (comment):", error.message);
    }
};
