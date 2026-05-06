import { ProfilePage } from "@/components/platform";

export default async function ProfileAddressRoute({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;

  return <ProfilePage address={decodeURIComponent(address)} />;
}
