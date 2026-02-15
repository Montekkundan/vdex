import { Hero } from "./home/hero";
import { UseCases } from "./home/use-cases";
import { Footer } from "./home/footer";

interface HomeSceneProps {
  isLoggedIn?: boolean;
}

export function HomeScene({ isLoggedIn = false }: HomeSceneProps) {
  return (
    <main>
      <Hero isLoggedIn={isLoggedIn} />
      <UseCases />
      <Footer />
    </main>
  );
}
