import { registerPanel } from '@/lib/plugins'
import { ColorPanel } from './ColorPanel'
import { LabelsPanel } from './LabelsPanel'
import { StatsPanel } from './StatsPanel'

/** Eingebaute Reiter. Weitere Module (Szenen, Planer, Licht) registrieren sich auf dieselbe Weise. */
registerPanel({ id: 'labels', title: 'Labels', component: LabelsPanel })
registerPanel({ id: 'color', title: 'Farbe', component: ColorPanel })
registerPanel({ id: 'stats', title: 'Statistik', component: StatsPanel })
