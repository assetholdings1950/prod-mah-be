import { doc, setDoc } from "firebase/firestore"
import { db } from "../config/firebaseConfig.js"


export const syncNewsLikeCount = async (newsId, likeCount) => {
    try {
        const ref = doc(db, "newsLike", newsId.toString());

        await setDoc(ref, {
            likeCount,
            createdAt: new Date().toISOString(),
        })

        console.log("✅ Synced to Firebase news like:", newsId, likeCount)
    } catch (error) {
        console.log("🔥 Firebase sync error news like:", error.message)
    }
}